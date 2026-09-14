const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { createStore } = require('./store');
const { createWorkflowService, enabled } = require('./service');
const { createRegistry } = require('./registry');
const { runChipMutation } = require('../../services/activateChipService');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');
const parameters = z.object({
  workflowId: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
  request: z.string().max(4000),
  conversation: z.string().max(200).optional(),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        tool: z.string(),
        args: z.record(z.string(), z.unknown()),
        dependsOn: z.array(z.string()),
      }),
    )
    .min(1)
    .max(10),
});
let service;
function initializeWorkflows(tools) {
  service = createWorkflowService({
    store: createStore(),
    registry: createRegistry(tools),
    boundary: runChipMutation,
  });

  return defineTool({
    name: 'propose_workflow',
    description:
      'Prepare an ordered workflow for a compound request. Each step has an ID, exact tool arguments and dependencies on earlier IDs. All writes receive one combined human approval. Never put unresolved future messages or conditional writes in a workflow: calculate and compose exact content first. To edit a paused workflow, pass its workflowId and revision and only the remaining steps; this invalidates its old approval. Maximum 10 steps. Returns a workflow card; the server executes it without confirm_write.',
    parameters,
    execute: wrapToolExecute('propose_workflow', (args) =>
      service.propose(getAgentChatId(), parameters.parse(args)),
    ),
  });
}
function getWorkflowStatusTool() {
  return defineTool({
    name: 'get_workflow_status',
    description:
      'Read the authenticated user’s durable workflow status and safe result references. Use after a workflow to retrieve its actual outcomes, current revision, and calculation IDs before answering follow-up requests. Never approves or advances a workflow.',
    parameters: z.object({ workflowId: z.string().uuid().optional() }),
    execute: wrapToolExecute('get_workflow_status', async ({ workflowId }) => {
      const owner = getAgentChatId();
      const flows = workflowId
        ? [await service.status(owner, workflowId)]
        : (await service.list(owner)).slice(-5);

      return {
        workflows: flows
          .filter(Boolean)
          .map((flow) => ({
            id: flow.id,
            revision: flow.revision,
            request: flow.request,
            state: flow.state,
            steps: flow.steps.map((step) => ({
              id: step.id,
              tool: step.tool,
              state: step.state,
              summary: step.result?.summary || step.summary,
              ...(step.result?.calculationId
                ? {
                    calculationId: step.result.calculationId,
                    teamId: step.result.teamId,
                    teamName: step.result.teamName,
                    chip: step.result.chip,
                  }
                : {}),
            })),
          })),
      };
    }),
  });
}
async function applyWorkflowRequest({ chatId, payload, list = false }) {
  if (!service) {
    require('../tools');
  }
  if (!Number.isFinite(chatId)) {
    return { status: 401, body: { status: 'unauthorized' } };
  }
  if (list) {
    return { status: 200, body: { workflows: await service.list(chatId) } };
  }
  if (
    !payload ||
    !/^[a-f0-9-]{36}$/.test(payload.id || '') ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 1 ||
    (payload.decision === 'advance' &&
      (typeof payload.stepId !== 'string' ||
        !payload.stepId ||
        payload.stepId.length > 60)) ||
    !['status', 'approve', 'cancel', 'resume', 'advance'].includes(
      payload.decision,
    )
  ) {
    return { status: 400, body: { status: 'invalid_input' } };
  }
  const body =
    payload.decision === 'status'
      ? await service.status(chatId, payload.id)
      : await service.decide(chatId, payload);

  return { status: body ? 200 : 404, body: body || { status: 'not_found' } };
}
module.exports = {
  initializeWorkflows,
  getWorkflowStatusTool,
  applyWorkflowRequest,
  enabled,
  hasActiveWorkflow: async (owner) => (service ? service.busy(owner) : false),
};
