jest.mock('@copilotkit/runtime/v2', () => ({ defineTool: (spec) => spec }));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('../../services/userMutationHydrationService', () => ({
  hydrateUserMutationState: jest.fn(),
}));
jest.mock('../../services/selectTeamService', () => ({
  resolveFreshTeamSelection: jest.fn(async ({ teamId }) => ({
    status: 'ok',
    teamId: teamId || 'A',
    teamName: `Team ${teamId || 'A'}`,
  })),
}));
jest.mock('../writeToolHelpers', () => ({
  getWorkflowWriteAdapter: jest.fn(),
}));
const z = require('zod');
const { createRegistry } = require('./registry');
const { getWorkflowWriteAdapter } = require('../writeToolHelpers');
const { currentTeamCache, userCache } = require('../../cache');
const {
  resolveFreshTeamSelection,
} = require('../../services/selectTeamService');
function setup() {
  currentTeamCache[42] = {
    A: { teamName: 'Team A' },
    B: { teamName: 'Team B' },
  };
  userCache['42'] = { selectedTeam: 'A', selectedChipByTeam: { B: null } };
  const commit = jest.fn(async () => ({ status: 'ok' }));
  const prepare = jest.fn(async ({ rawArgs }) => ({
    args: rawArgs,
    intentArgs: rawArgs,
    summary: 'Set chip',
  }));
  getWorkflowWriteAdapter.mockImplementation((name) =>
    name === 'activate_chip' ? { commit, prepare } : null,
  );
  const read = {
    name: 'get_best_teams',
    description: 'Calculate best teams.',
    parameters: z.object({
      teamId: z.string(),
      chipOverride: z.string().optional(),
    }),
    execute: jest.fn(async () => ({ status: 'ok', calculationId: 'c' })),
  };
  const registry = createRegistry([{ name: 'activate_chip' }, read]);

  return { registry, commit, prepare, read };
}
afterEach(() => jest.clearAllMocks());
test('earlier team selection binds later implicit targets, even if active team changes', async () => {
  const { registry } = setup();
  const adapter = registry.get('activate_chip');
  const step = await adapter.prepare(
    42,
    { chip: 'EXTRA_BOOST' },
    { teamId: 'B' },
  );
  expect(step.args.teamId).toBe('B');
  userCache['42'].selectedTeam = 'A';
  expect((await adapter.revalidate(42, step)).valid).toBe(true);
  expect(resolveFreshTeamSelection).toHaveBeenLastCalledWith(
    expect.objectContaining({ teamId: 'B' }),
  );
});
test('external chip or source change invalidates approved precondition', async () => {
  const { registry } = setup();
  const adapter = registry.get('activate_chip');
  const step = await adapter.prepare(42, { teamId: 'B', chip: 'EXTRA_BOOST' });
  userCache['42'].selectedChipByTeam.B = 'WILDCARD';
  expect((await adapter.revalidate(42, step)).valid).toBe(false);
});
test('hypothetical calculation preserves chip override and never calls a write', async () => {
  const { registry, read, commit } = setup();
  const adapter = registry.get('get_best_teams');
  const step = await adapter.prepare(42, {
    teamId: 'B',
    chipOverride: 'EXTRA_BOOST',
  });
  await adapter.execute(42, step);
  expect(read.execute).toHaveBeenCalledWith({
    teamId: 'B',
    chipOverride: 'EXTRA_BOOST',
  });
  expect(commit).not.toHaveBeenCalled();
});
test('fresh authorization denial prevents execution', async () => {
  const { registry, prepare, commit } = setup();
  const adapter = registry.get('activate_chip');
  const step = await adapter.prepare(42, { teamId: 'B', chip: 'EXTRA_BOOST' });
  prepare.mockResolvedValue({ status: 'forbidden' });
  expect((await adapter.revalidate(42, step)).valid).toBe(false);
  expect(commit).not.toHaveBeenCalled();
});
test('no-op is not assumed when an earlier workflow write may change it', async () => {
  const { registry, prepare } = setup();
  prepare.mockResolvedValue({
    status: 'ok',
    changed: false,
    summary: 'Already set',
  });
  const adapter = registry.get('activate_chip');
  expect(
    (await adapter.prepare(42, { teamId: 'B', chip: 'EXTRA_BOOST' })).satisfied,
  ).toBe(true);
  expect(
    (
      await adapter.prepare(
        42,
        { teamId: 'B', chip: 'EXTRA_BOOST' },
        { priorSteps: [{ write: true }] },
      )
    ).satisfied,
  ).toBe(false);
});

test('model-supplied owner identity cannot override the authenticated owner', async () => {
  const { registry } = setup();
  await registry
    .get('activate_chip')
    .prepare(42, { chatId: 99, teamId: 'B', chip: 'EXTRA_BOOST' });
  expect(resolveFreshTeamSelection).toHaveBeenLastCalledWith(
    expect.objectContaining({ chatId: 42 }),
  );
});
test('a downstream calculation binds the chip from the preceding write', async () => {
  const { registry } = setup();
  const step = await registry
    .get('get_best_teams')
    .prepare(
      42,
      {},
      {
        teamId: 'B',
        priorSteps: [
          { tool: 'activate_chip', args: { teamId: 'B', chip: 'EXTRA_BOOST' } },
        ],
      },
    );
  expect(step.args).toEqual({ teamId: 'B', chipOverride: 'EXTRA_BOOST' });
});
