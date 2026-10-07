const { createWorkflowService } = require('./service');
function harness(boundary) {
  const rows = new Map();
  const receipts = new Map();
  let version = 0;
  let lease;
  let historyVersion = 0;
  const store = {
    history: async () => ({ version: historyVersion }),
    clearHistory: async () => {
      historyVersion++;

      return true;
    },
    saveProposal: async (owner, flow, create, expected) =>
      expected !== historyVersion
        ? 'cancelled'
        : (await store.save(owner, flow, create))
          ? 'saved'
          : 'conflict',
    putReceipt: async (_owner, flow, step) => {
      receipts.set(step.claimId, structuredClone({ flow }));
    },
    getReceipt: async (_owner, _flow, step) =>
      structuredClone(receipts.get(step.claimId)),
    read: jest.fn(async (owner, id) =>
      structuredClone(
        id === 'lease'
          ? lease
            ? { workflowId: lease }
            : null
          : rows.get(`${owner}/${id}`) || null,
      ),
    ),
    save: jest.fn(async (owner, flow, create) => {
      const key = `${owner}/${flow.id}`;
      const old = rows.get(key);
      if (create ? old : !old || old.etag !== flow.etag) {
        return false;
      }
      rows.set(key, structuredClone({ ...flow, etag: ++version }));

      return true;
    }),
    list: async (owner) => [...rows.values()].filter((f) => f.owner === owner),
    acquire: async (_owner, id) => {
      if (lease && lease !== id) {
        return false;
      }
      lease = id;

      return true;
    },
    release: async (_owner, id) => {
      if (lease === id) {
        lease = null;
      }
    },
  };
  let now = 0;
  const write = {
    write: true,
    prepare: jest.fn(async (_owner, args) => ({
      args,
      intentArgs: args,
      summary: 'Set chip',
      satisfied: false,
    })),
    revalidate: jest.fn(async () => ({ valid: true })),
    execute: jest.fn(async () => ({ status: 'ok', changed: true })),
    afterWrite: jest.fn(),
    success: (r) => r.status === 'ok',
    started: () => false,
  };
  const read = {
    ...write,
    write: false,
    execute: jest.fn(async () => ({
      status: 'ok',
      calculationId: 'fresh-calculation',
    })),
  };
  const registry = new Map([
    ['activate_chip', write],
    ['get_best_teams', read],
  ]);
  const service = createWorkflowService({
    store,
    registry,
    clock: () => now,
    boundary,
    audit: jest.fn(),
  });
  const input = {
    request: 'Select Extra DRS and show best teams',
    steps: [
      {
        id: 'chip',
        tool: 'activate_chip',
        args: { teamId: 'X', chip: 'EXTRA_BOOST' },
        dependsOn: [],
      },
      {
        id: 'teams',
        tool: 'get_best_teams',
        args: { teamId: 'X' },
        dependsOn: ['chip'],
      },
    ],
  };

  return {
    service,
    registry,
    write,
    read,
    input,
    store,
    advanceTime: () => {
      now += 300001;
    },
  };
}
const decision = (f, action, stepId = 'chip') => ({
  id: f.id,
  revision: f.revision,
  decision: action,
  stepId,
});
test('one approval, sequential execution, fresh read reference and both results', async () => {
  const h = harness();
  const flow = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(flow, 'advance'));
  expect(h.write.execute).not.toHaveBeenCalled();
  await h.service.decide(42, decision(flow, 'approve'));
  const first = await h.service.decide(42, decision(flow, 'advance'));
  expect(first.steps[0].state).toBe('completed');
  expect(h.read.execute).not.toHaveBeenCalled();
  const final = await h.service.decide(42, decision(flow, 'advance', 'teams'));
  expect(final.state).toBe('completed');
  expect(final.steps[1].result.calculationId).toBe('fresh-calculation');
});
test('read-only workflows run without approval', async () => {
  const h = harness();
  const f = await h.service.propose(42, {
    steps: [{ ...h.input.steps[1], dependsOn: [] }],
  });
  expect(f.state).toBe('ready');
  expect(
    (await h.service.decide(42, decision(f, 'advance', 'teams'))).state,
  ).toBe('completed');
});
test('double approval and duplicate completed advance never execute next step', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await Promise.all([
    h.service.decide(42, decision(f, 'approve')),
    h.service.decide(42, decision(f, 'approve')),
  ]);
  await Promise.all([
    h.service.decide(42, decision(f, 'advance')),
    h.service.decide(42, decision(f, 'advance')),
  ]);
  await h.service.decide(42, decision(f, 'advance'));
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(h.read.execute).not.toHaveBeenCalled();
});
test('owner and revision are enforced; text or ID possession cannot approve', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  expect(await h.service.status(43, f.id)).toBeNull();
  expect((await h.service.decide(43, decision(f, 'approve'))).status).toBe(
    'not_found',
  );
  expect(
    (await h.service.decide(42, { ...decision(f, 'approve'), revision: 0 }))
      .status,
  ).toBe('stale_revision');
  expect((await h.service.decide(42, decision(f, 'yes'))).status).toBe(
    'invalid_input',
  );
});
test('calculation failure preserves successful write; explicit resume retries only read', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  await h.service.decide(42, decision(f, 'advance'));
  h.read.execute.mockRejectedValueOnce(new Error('private storage details'));
  const failed = await h.service.decide(42, decision(f, 'advance', 'teams'));
  expect(failed.state).toBe('failed');
  expect(failed.steps[0].state).toBe('completed');
  expect(JSON.stringify(failed)).not.toContain('private storage');
  await h.service.decide(42, decision(f, 'resume'));
  await h.service.decide(42, decision(f, 'advance', 'teams'));
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(h.read.execute).toHaveBeenCalledTimes(2);
});
test('unknown write is never retried', async () => {
  const h = harness();
  h.write.execute.mockRejectedValue(new Error());
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  expect((await h.service.decide(42, decision(f, 'advance'))).state).toBe(
    'outcome_unknown',
  );
  await h.service.decide(42, decision(f, 'resume'));
  await h.service.decide(42, decision(f, 'advance'));
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(h.read.execute).not.toHaveBeenCalled();
});
test('cancel during invocation retains eventual outcome and prevents next step', async () => {
  const h = harness();
  let finish;
  h.write.execute.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  const running = h.service.decide(42, decision(f, 'advance'));
  while (!finish) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect((await h.service.decide(42, decision(f, 'cancel'))).state).toBe(
    'cancelling',
  );
  finish({ status: 'ok' });
  const cancelled = await running;
  expect(cancelled.state).toBe('cancelled');
  expect(cancelled.steps[0].state).toBe('completed');
  expect(h.read.execute).not.toHaveBeenCalled();
});
test('expiry creates a new remaining revision and invalidates old approval', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  h.advanceTime();
  const expired = await h.service.decide(42, decision(f, 'advance'));
  expect(expired.revision).toBe(2);
  expect(expired.state).toBe('awaiting_approval');
  expect(h.write.execute).not.toHaveBeenCalled();
});
test('a second workflow cannot interleave', async () => {
  const h = harness();
  const a = await h.service.propose(42, h.input);
  const b = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(a, 'approve'));
  await h.service.decide(42, decision(b, 'approve'));
  await h.service.decide(42, decision(a, 'advance'));
  const blocked = await h.service.decide(42, decision(b, 'advance'));
  expect(blocked.status).toBe('busy');
  expect(blocked.blockingWorkflow.id).toBe(a.id);
  expect(blocked.blockingWorkflow.steps[0].state).toBe('completed');
  expect(blocked.blockingWorkflow).not.toHaveProperty('owner');
  await h.service.decide(42, decision(a, 'cancel'));
  const resumed = await h.service.decide(42, decision(b, 'advance'));
  expect(resumed.steps[0].state).toBe('completed');
});
test('invalid dependencies and step limits reject before writes', async () => {
  const h = harness();
  await expect(
    h.service.propose(42, { steps: [h.input.steps[1]] }),
  ).rejects.toThrow('dependencies');
  await expect(
    h.service.propose(42, { steps: Array(11).fill(h.input.steps[0]) }),
  ).rejects.toThrow('steps');
});

test('serialized duplicate requests recheck the next step inside the boundary', async () => {
  let tail = Promise.resolve();
  const h = harness((_owner, run) => {
    const next = tail.then(run);
    tail = next;

    return next;
  });
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  await Promise.all([
    h.service.decide(42, decision(f, 'advance')),
    h.service.decide(42, decision(f, 'advance')),
  ]);
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(h.read.execute).not.toHaveBeenCalled();
});
test('editing the remaining workflow invalidates the previous approval', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  const edited = await h.service.propose(42, {
    ...h.input,
    workflowId: f.id,
    revision: 1,
    steps: [
      { ...h.input.steps[0], args: { teamId: 'B', chip: 'WILDCARD' } },
      h.input.steps[1],
    ],
  });
  expect(edited.id).toBe(f.id);
  expect(edited.revision).toBe(2);
  expect(edited.state).toBe('awaiting_approval');
  expect((await h.service.decide(42, decision(f, 'advance'))).status).toBe(
    'stale_revision',
  );
  expect(h.write.execute).not.toHaveBeenCalled();
});
test('async jobs pause after Started and never assume dependent reads are ready', async () => {
  const h = harness();
  h.write.success = () => false;
  h.write.started = () => true;
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  expect((await h.service.decide(42, decision(f, 'advance'))).state).toBe(
    'started',
  );
  await h.service.decide(42, decision(f, 'advance', 'teams'));
  expect(h.read.execute).not.toHaveBeenCalled();
});
test('partial delivery stops all subsequent steps', async () => {
  const h = harness();
  h.write.execute.mockResolvedValue({ status: 'failed', sent: 1, failed: 1 });
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  const stopped = await h.service.decide(42, decision(f, 'advance'));
  expect(stopped.state).toBe('failed');
  expect(stopped.steps[0].result.sent).toBe(1);
  await h.service.decide(42, decision(f, 'advance', 'teams'));
  expect(h.read.execute).not.toHaveBeenCalled();
});

test('a new worker recovers a persisted outcome after the workflow-state save is lost', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  const save = h.store.save.getMockImplementation();
  h.store.save.mockImplementation(async (owner, flow, create) => {
    if (flow.steps[0].state === 'completed') {
      throw new Error('Lost state save');
    }

    return save(owner, flow, create);
  });
  await expect(h.service.decide(42, decision(f, 'advance'))).rejects.toThrow(
    'Lost state save',
  );
  h.store.save.mockImplementation(save);
  const worker = createWorkflowService({
    store: h.store,
    registry: h.registry,
    clock: () => 0,
    audit: jest.fn(),
  });
  const recovered = await worker.status(42, f.id);
  expect(recovered.steps[0].state).toBe('completed');
  expect(recovered.state).toBe('ready');
  await worker.decide(42, decision(f, 'advance', 'teams'));
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(h.read.execute).toHaveBeenCalledTimes(1);
});

test('validation errors are durable failures and never invoke an action', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  h.write.revalidate.mockRejectedValue(new Error('Private Azure detail'));
  const failure = await h.service.decide(42, decision(f, 'advance'));
  expect(failure.state).toBe('failed');
  expect(h.write.execute).not.toHaveBeenCalled();
  expect(JSON.stringify(failure)).not.toContain('Private Azure');
});
test('post-write hydration failure preserves the successful write outcome', async () => {
  const h = harness();
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  h.read.afterWrite.mockRejectedValueOnce(new Error('Storage unavailable'));
  const failure = await h.service.decide(42, decision(f, 'advance'));
  expect(failure.state).toBe('failed');
  expect(failure.steps[0].state).toBe('completed');
  expect(failure.steps[1].state).toBe('failed');
  expect(h.read.execute).not.toHaveBeenCalled();
});

test('missing chip retains the entire request and dependent calculation before approval', async () => {
  const { service, write, read, input, store } = harness();
  delete input.steps[0].args.chip;
  write.prepare.mockResolvedValueOnce({
    status: 'selection_required',
    choice: 'chip',
    options: [
      {
        label: 'Extra DRS',
        action: 'activate_chip',
        args: { teamId: 'X', chip: 'EXTRA_BOOST' },
      },
    ],
  });
  const result = await service.propose(42, input);
  expect(result).toMatchObject({
    status: 'selection_required',
    pendingStepId: 'chip',
    pendingWorkflow: input,
  });
  expect(result.pendingWorkflow.steps).toHaveLength(2);
  expect(store.save).not.toHaveBeenCalled();
  expect(write.execute).not.toHaveBeenCalled();
  expect(read.execute).not.toHaveBeenCalled();
});

test('clear cancels all owner workflows, preserving completed results and other accounts', async () => {
  const h = harness();
  const completed = await h.service.propose(42, {
    request: 'Done',
    steps: [{ id: 'done', tool: 'get_best_teams', args: {}, dependsOn: [] }],
  });
  await h.service.decide(42, decision(completed, 'advance', 'done'));
  const active = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(active, 'approve'));
  await h.service.decide(42, decision(active, 'advance'));
  const pending = await h.service.propose(42, h.input);
  const other = await h.service.propose(43, h.input);
  const result = await h.service.cancelAll(42);
  expect(result.status).toBe('ok');
  expect((await h.service.status(42, completed.id)).state).toBe('completed');
  expect((await h.service.status(42, active.id)).steps[0].state).toBe(
    'completed',
  );
  expect((await h.service.status(42, active.id)).state).toBe('cancelled');
  expect((await h.service.status(42, pending.id)).state).toBe('cancelled');
  expect((await h.service.status(43, other.id)).state).toBe(
    'awaiting_approval',
  );
  expect(await h.service.busy(42)).toBe(false);
});

test('clear during execution lets the claimed action finish but never starts the next step', async () => {
  const h = harness();
  let finish;
  h.write.execute.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  const running = h.service.decide(42, decision(f, 'advance'));
  while (!finish) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const result = await h.service.cancelAll(42);
  expect(result.workflows[0].state).toBe('cancelling');
  finish({ status: 'ok' });
  const after = await running;
  expect(after.state).toBe('cancelled');
  expect(after.steps[0].state).toBe('completed');
  expect(after.steps[1].state).toBe('cancelled');
  expect(h.read.execute).not.toHaveBeenCalled();
  expect(await h.service.busy(42)).toBe(false);
});

test('a proposal prepared before clear cannot appear afterward', async () => {
  const h = harness();
  let finish;
  h.write.prepare.mockImplementationOnce(
    (_owner, args) =>
      new Promise((resolve) => {
        finish = () => resolve({ args, summary: 'Chip' });
      }),
  );
  const pending = h.service.propose(42, h.input);
  while (!finish) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await h.service.cancelAll(42);
  finish();
  expect((await pending).status).toBe('cancelled');
  expect(await h.service.list(42)).toEqual([]);
  expect((await h.service.propose(42, h.input)).state).toBe(
    'awaiting_approval',
  );
});

test('clear preserves uncertain writes for reconciliation rather than retrying or releasing them blindly', async () => {
  const h = harness();
  h.write.execute.mockRejectedValue(new Error('Lost response'));
  const f = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(f, 'approve'));
  await h.service.decide(42, decision(f, 'advance'));
  await h.service.cancelAll(42);
  expect((await h.service.status(42, f.id)).state).toBe('outcome_unknown');
  expect(await h.service.busy(42)).toBe(true);
  h.write.reconcile = jest.fn(async () => ({ status: 'ok' }));
  expect((await h.service.decide(42, decision(f, 'resume'))).state).toBe(
    'cancelled',
  );
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(h.read.execute).not.toHaveBeenCalled();
  expect(await h.service.busy(42)).toBe(false);
});

test('bulk cancellation retries concurrent ETag changes instead of falsely reporting success', async () => {
  const h = harness();
  const flow = await h.service.propose(42, h.input);
  h.store.save.mockResolvedValueOnce(false);
  expect((await h.service.cancelAll(42)).status).toBe('ok');
  expect((await h.service.status(42, flow.id)).state).toBe('cancelled');
});

test('a write becoming uncertain after clear remains recoverable without repeating it', async () => {
  const h = harness(); let finish;
  h.write.execute.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  const flow = await h.service.propose(42, h.input);
  await h.service.decide(42, decision(flow, 'approve'));
  const running = h.service.decide(42, decision(flow, 'advance'));
  while (!finish) {await new Promise(resolve => setImmediate(resolve));}
  await h.service.cancelAll(42);
  finish({ status: 'failed', uncertain: true });
  expect((await running).state).toBe('outcome_unknown');
  h.write.reconcile = jest.fn(async () => ({ status: 'ok' }));
  expect((await h.service.decide(42, decision(flow, 'resume'))).state).toBe('cancelled');
  expect(h.write.execute).toHaveBeenCalledTimes(1);
  expect(await h.service.busy(42)).toBe(false);
});
