const { randomUUID } = require('crypto');
const APPROVAL_MS = 5 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const enabled = () => process.env.AGENT_WORKFLOWS_ENABLED === 'true';
const finished = (step) =>
  ['completed', 'already_satisfied'].includes(step.state);
const terminal = (flow) => ['completed', 'cancelled'].includes(flow.state);

function createWorkflowService({
  store,
  registry,
  clock = Date.now,
  featureEnabled = enabled,
  boundary = async (_owner, fn) => fn(),
  audit = (event) => console.info('agent_workflow', JSON.stringify(event)),
}) {
  const publicFlow = (flow) => {
    if (!flow) {
      return null;
    }
    const {
      etag: _etag,
      owner: _owner,
      precondition: _precondition,
      ...safe
    } = flow;
    safe.steps = flow.steps.map(
      ({ intentArgs: _intentArgs, precondition: _stepPrecondition, ...step }) =>
        step,
    );

    return { ...safe, enabled: featureEnabled() };
  };
  function log(flow, event, step) {
    const entry = {
      workflowId: flow.id,
      revision: flow.revision,
      event,
      workflowState: flow.state,
      stepId: step?.id,
      status: step?.state,
      durationMs:
        step?.startedAt !== undefined ? clock() - step.startedAt : undefined,
    };
    try {
      Promise.resolve(audit(entry)).catch(() => {});
    } catch {
      /* Logging cannot change execution semantics. */
    }
  }
  async function get(owner, id) {
    const flow = await store.read(owner, id);
    if (
      !flow ||
      flow.owner !== owner ||
      Date.parse(flow.expiresAt) <= clock()
    ) {
      return null;
    }
    const claimed = flow.steps.find(
      (step) =>
        ['running', 'outcome_unknown'].includes(step.state) && step.claimId,
    );
    const receipt =
      claimed && store.getReceipt
        ? await store.getReceipt(owner, flow, claimed)
        : null;
    if (
      receipt &&
      receipt.flow.steps.find((step) => step.id === claimed.id)?.state !==
        claimed.state
    ) {
      const recovered = {
        ...receipt.flow,
        etag: flow.etag,
        cancelRequested: flow.cancelRequested,
      };
      if (flow.cancelRequested) {
        recovered.state = 'cancelled';
        recovered.steps.forEach((step) => {
          if (step.state === 'waiting') {
            step.state = 'cancelled';
          }
        });
      }
      if (!(await store.save(owner, recovered))) {
        return get(owner, id);
      }
      if (terminal(recovered)) {
        await store.release(owner, flow.id);
      }

      return get(owner, id);
    }
    const abandoned = flow.steps.find(
      (step) =>
        step.state === 'running' && clock() - step.startedAt >= APPROVAL_MS,
    );
    if (abandoned) {
      abandoned.state = abandoned.write ? 'outcome_unknown' : 'failed';
      flow.state = abandoned.state;
      if (!(await store.save(owner, flow))) {
        return get(owner, id);
      }
      log(flow, 'abandoned_claim', abandoned);

      return get(owner, id);
    }

    return flow;
  }
  async function prepare(owner, input) {
    if (
      !Array.isArray(input.steps) ||
      input.steps.length < 1 ||
      input.steps.length > 10
    ) {
      throw new Error('Invalid steps');
    }
    const ids = new Set();
    const steps = [];
    let teamId;
    for (const raw of input.steps) {
      if (
        !raw.id ||
        ids.has(raw.id) ||
        !Array.isArray(raw.dependsOn) ||
        raw.dependsOn.some((id) => !ids.has(id))
      ) {
        throw new Error('Invalid dependencies');
      }
      ids.add(raw.id);
      const adapter = registry.get(raw.tool);
      if (!adapter) {
        throw new Error('Unsupported workflow tool');
      }
      const prepared = await adapter.prepare(owner, raw.args || {}, {
        teamId,
        priorSteps: steps,
      });
      if (prepared.status && prepared.status !== 'ok') {
        return { ...prepared, pendingWorkflow: input, pendingStepId: raw.id };
      }
      if (
        ['select_team', 'activate_chip', 'set_best_team_ranking'].includes(
          raw.tool,
        )
      ) {
        teamId = prepared.args.teamId;
      }
      steps.push({
        id: raw.id,
        tool: raw.tool,
        dependsOn: raw.dependsOn,
        ...prepared,
        state: 'waiting',
        write: adapter.write,
      });
    }

    return { steps };
  }
  async function propose(owner, input) {
    if (!featureEnabled()) {
      return { status: 'disabled' };
    }
    const previous = input.workflowId
      ? await get(owner, input.workflowId)
      : null;
    if (
      input.workflowId &&
      (!previous || previous.revision !== input.revision)
    ) {
      return { status: 'stale_revision' };
    }
    if (
      previous &&
      (terminal(previous) ||
        previous.steps.some((s) =>
          ['running', 'outcome_unknown', 'started'].includes(s.state),
        ))
    ) {
      return { status: 'conflict' };
    }
    const completed = previous?.steps.filter(finished) || [];
    if (
      input.steps.some((step) => completed.some((done) => done.id === step.id))
    ) {
      return { status: 'invalid_input' };
    }
    const prepared = await prepare(owner, input);
    if (!prepared.steps) {
      return prepared;
    }
    if (completed.length + prepared.steps.length > 10) {
      return { status: 'invalid_input' };
    }
    const flow = {
      id: previous?.id || randomUUID(),
      owner,
      revision: (previous?.revision || 0) + 1,
      conversation: input.conversation || previous?.conversation || '',
      request: input.request || previous?.request || '',
      steps: [...completed, ...prepared.steps],
      state: 'awaiting_approval',
      createdAt: previous?.createdAt || clock(),
      approvalExpiresAt: clock() + APPROVAL_MS,
      expiresAt:
        previous?.expiresAt || new Date(clock() + RETENTION_MS).toISOString(),
      ...(previous ? { etag: previous.etag } : {}),
    };
    if (!prepared.steps.some((s) => s.write && !s.satisfied)) {
      flow.state = 'ready';
    }
    if (!(await store.save(owner, flow, !previous))) {
      return { status: 'conflict' };
    }
    log(flow, previous ? 'revised' : 'proposed');

    return publicFlow(flow);
  }
  async function refreshRemaining(owner, flow) {
    const remaining = flow.steps.filter((step) => !finished(step));
    const ids = new Set(remaining.map((step) => step.id));
    const prepared = await prepare(owner, {
      steps: remaining.map((step) => ({
        id: step.id,
        tool: step.tool,
        args: step.args,
        dependsOn: step.dependsOn.filter((id) => ids.has(id)),
      })),
    });
    if (!prepared.steps) {
      return false;
    }
    flow.steps = [...flow.steps.filter(finished), ...prepared.steps];
    flow.revision += 1;
    flow.approvalExpiresAt = clock() + APPROVAL_MS;
    flow.state = flow.steps.some((s) => !finished(s) && s.write && !s.satisfied)
      ? 'awaiting_approval'
      : 'ready';
    delete flow.approvedRevision;
    await store.save(owner, flow);
    log(flow, 'stale_approval');

    return true;
  }
  async function decide(owner, input) {
    let flow = await get(owner, input.id);
    if (!flow) {
      return { status: 'not_found' };
    }
    if (flow.revision !== input.revision) {
      log(flow, 'stale_revision');

      return { status: 'stale_revision', workflow: publicFlow(flow) };
    }
    if (input.decision === 'cancel') {
      if (terminal(flow)) {
        return publicFlow(flow);
      }
      flow.cancelRequested = true;
      flow.state = flow.steps.some((s) => s.state === 'running')
        ? 'cancelling'
        : 'cancelled';
      flow.steps.forEach((step) => {
        if (step.state === 'waiting') {
          step.state = 'cancelled';
        }
      });
      if (!(await store.save(owner, flow))) {
        return { status: 'conflict' };
      }
      if (
        flow.state === 'cancelled' &&
        !flow.steps.some((s) => s.state === 'outcome_unknown')
      ) {
        await store.release(owner, flow.id);
      }

      return publicFlow(flow);
    }
    if (!featureEnabled()) {
      return { status: 'disabled', workflow: publicFlow(flow) };
    }
    if (terminal(flow)) {
      return publicFlow(flow);
    }
    if (input.decision === 'resume' && flow.state === 'outcome_unknown') {
      const uncertain = flow.steps.find(
        (step) => step.state === 'outcome_unknown',
      );
      const adapter = registry.get(uncertain.tool);
      const reconciled = adapter.reconcile
        ? await boundary(owner, () => adapter.reconcile(owner, uncertain))
        : null;
      if (reconciled) {
        uncertain.state = 'already_satisfied';
        uncertain.result = reconciled;
        flow.state = flow.steps.every(finished) ? 'completed' : 'ready';
        if (!(await store.save(owner, flow))) {
          return { status: 'conflict' };
        }
        if (terminal(flow)) {
          await store.release(owner, flow.id);
        }

        return publicFlow(flow);
      }
    }
    if (
      flow.steps.some((s) =>
        ['running', 'outcome_unknown', 'started'].includes(s.state),
      )
    ) {
      return publicFlow(flow);
    }
    if (!['approve', 'resume', 'advance'].includes(input.decision)) {
      return { status: 'invalid_input' };
    }
    if (input.decision === 'resume' && flow.state === 'failed') {
      const failed = flow.steps.find((s) => s.state === 'failed');
      if (!failed || failed.write) {
        return publicFlow(flow);
      }
      failed.state = 'waiting';
      flow.state = 'ready';
    }
    if (clock() >= flow.approvalExpiresAt) {
      await refreshRemaining(owner, flow);

      return publicFlow(await get(owner, flow.id));
    }
    if (input.decision === 'approve' && flow.state === 'awaiting_approval') {
      flow.approvedRevision = flow.revision;
      flow.state = 'ready';
      if (!(await store.save(owner, flow))) {
        return { status: 'conflict' };
      }

      return publicFlow(await get(owner, flow.id));
    }
    if (input.decision !== 'advance') {
      if (!(await store.save(owner, flow))) {
        return { status: 'conflict' };
      }

      return publicFlow(await get(owner, flow.id));
    }
    if (flow.state !== 'ready') {
      return publicFlow(flow);
    }
    if (input.stepId !== flow.steps.find((s) => !finished(s))?.id) {
      return publicFlow(flow);
    }
    if (!(await store.acquire(owner, flow.id))) {
      return { status: 'busy', workflow: publicFlow(flow) };
    }

    return boundary(owner, async () => {
      flow = await get(owner, flow.id);
      if (
        !flow ||
        input.revision !== flow.revision ||
        input.stepId !== flow.steps.find((s) => !finished(s))?.id ||
        clock() >= flow.approvalExpiresAt ||
        flow.state !== 'ready' ||
        flow.cancelRequested ||
        !featureEnabled()
      ) {
        return publicFlow(flow);
      }
      const step = flow.steps.find((s) => !finished(s));
      if (
        !step ||
        step.dependsOn.some(
          (id) => !flow.steps.some((s) => s.id === id && finished(s)),
        )
      ) {
        return publicFlow(flow);
      }
      const adapter = registry.get(step.tool);
      let validated;
      try {
        validated = await adapter.revalidate(owner, step);
      } catch {
        step.state = 'failed';
        step.result = {
          status: 'failed',
          tool: step.tool,
          summary:
            step.uiLang === 'he'
              ? 'לא ניתן היה לאמת את הפעולה. הפעולה לא הופעלה.'
              : 'Validation could not be completed. The action was not started.',
        };
        flow.state = 'failed';
        if (!(await store.save(owner, flow))) {
          return { status: 'conflict' };
        }
        log(flow, 'validation_failed', step);

        return publicFlow(flow);
      }
      if (!validated.valid && validated.failure) {
        step.state = 'failed';
        step.result = validated.failure;
        flow.state = 'failed';
        if (!(await store.save(owner, flow))) {
          return { status: 'conflict' };
        }

        return publicFlow(flow);
      }
      if (!validated.valid) {
        if (!(await refreshRemaining(owner, flow))) {
          flow.state = 'failed';
          step.state = 'failed';
          await store.save(owner, flow);
        }

        return publicFlow(await get(owner, flow.id));
      }
      if (
        step.write &&
        !validated.satisfied &&
        flow.approvedRevision !== flow.revision
      ) {
        return publicFlow(flow);
      }
      step.state = 'running';
      step.startedAt = clock();
      step.claimId = randomUUID();
      flow.state = 'running';
      if (!(await store.save(owner, flow))) {
        return { status: 'conflict' };
      }
      log(flow, 'step_started', step);
      let result;
      try {
        result = validated.satisfied
          ? validated.result
          : await adapter.execute(owner, step);
        step.result = result;
        step.state = result?.uncertain
          ? 'outcome_unknown'
          : validated.satisfied
            ? 'already_satisfied'
            : adapter.success(result)
              ? 'completed'
              : adapter.started(result)
                ? 'started'
                : 'failed';
      } catch {
        step.state = step.write ? 'outcome_unknown' : 'failed';
        step.result = {
          status: step.state,
          summary: 'The action could not be verified.',
        };
      }
      // Re-read to preserve cancellation arriving while invocation was running.
      const latest = await get(owner, flow.id);
      if (
        !latest ||
        latest.steps.find((s) => s.id === step.id)?.claimId !== step.claimId
      ) {
        return { status: 'conflict' };
      }
      latest.steps[latest.steps.findIndex((s) => s.id === step.id)] = step;
      latest.state = latest.cancelRequested
        ? 'cancelled'
        : !finished(step)
          ? step.state
          : latest.steps.every(finished)
            ? 'completed'
            : 'ready';
      if (finished(step) && step.write) {
        // Expected downstream saved state is captured inside the same mutation
        // boundary as the successful write, never from another browser's input.
        try {
          for (const next of latest.steps.filter((s) => !finished(s))) {
            await registry.get(next.tool).afterWrite(owner, next);
          }
        } catch {
          const next = latest.steps.find((s) => !finished(s));
          if (next) {
            next.state = 'failed';
            next.result = {
              status: 'failed',
              tool: next.tool,
              summary:
                next.uiLang === 'he'
                  ? 'השינוי נשמר, אך לא ניתן לאמת את הפעולה הבאה.'
                  : 'The change was saved, but the next action could not be validated.',
            };
          }
          latest.state = latest.cancelRequested ? 'cancelled' : 'failed';
        }
      }
      if (store.putReceipt) {
        await store.putReceipt(owner, latest, step);
      }
      if (!(await store.save(owner, latest))) {
        return { status: 'conflict' };
      }
      log(latest, 'step_finished', step);
      if (
        terminal(latest) &&
        !latest.steps.some((s) => s.state === 'outcome_unknown')
      ) {
        await store.release(owner, latest.id);
      }

      return publicFlow(latest);
    });
  }

  return {
    propose,
    decide,
    busy: async (owner) => Boolean(await store.read(owner, 'lease')),
    status: async (owner, id) => publicFlow(await get(owner, id)),
    list: async (owner) =>
      (
        await Promise.all(
          (await store.list(owner))
            .filter((f) => f.owner === owner)
            .map(async (f) => publicFlow(await get(owner, f.id))),
        )
      )
        .filter(Boolean)
        .sort((a, b) => a.createdAt - b.createdAt),
  };
}
module.exports = { createWorkflowService, enabled, APPROVAL_MS, RETENTION_MS };
