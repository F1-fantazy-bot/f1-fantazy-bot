jest.mock('../../leagueRegistryService', () => ({ listUserLeagues: jest.fn() }));
jest.mock('../../azureStorageService', () => ({ getLeagueData: jest.fn() }));
jest.mock('../../raceScheduleService', () => ({ fetchCurrentSeasonRaces: jest.fn() }));
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


test('standings workflow prepares league then period choices and binds the selected race', async () => {
  setup();
  const { listUserLeagues } = require('../../leagueRegistryService');
  const { getLeagueData } = require('../../azureStorageService');
  listUserLeagues.mockResolvedValue([{ leagueCode: 'C7', leagueName: 'League' }]);
  getLeagueData.mockResolvedValue({ teams: [{ raceScores: { matchday_10: 20, matchday_2: 1 } }] });
  const tool = { name: 'get_leaderboard', description: 'Standings.', parameters: z.object({
    leagueCode: z.string(), period: z.enum(['season', 'race']).optional(), matchdayId: z.number().optional(), raceName: z.string().optional(),
  }), execute: jest.fn() };
  const adapter = createRegistry([tool]).get('get_leaderboard');
  const leagues = await adapter.prepare(42, {});
  expect(leagues.choice).toBe('league');
  const periods = await adapter.prepare(42, leagues.options[0].args);
  expect(periods.choice).toBe('period');
  expect(periods.options.map((option) => option.label)).toEqual(['Entire season', 'R10', 'R2']);
  const prepared = await adapter.prepare(42, periods.options[1].args);
  expect(prepared.args).toEqual({ leagueCode: 'C7', period: 'race', matchdayId: 10 });
  expect(prepared.summary).toContain('R10');
  expect((await adapter.revalidate(42, prepared)).valid).toBe(true);
  await adapter.execute(42, prepared);
  expect(tool.execute).toHaveBeenCalledWith(prepared.args);
  const direct = await adapter.prepare(42, { period: 'race', matchdayId: 2 });
  expect(direct.options[0].args).toMatchObject({ period: 'race', matchdayId: 2 });
  expect((await adapter.prepare(42, direct.options[0].args)).args.matchdayId).toBe(2);
  expect((await adapter.prepare(42, { leagueCode: 'C7', period: 'season' })).args.period).toBe('season');
  expect(await adapter.prepare(42, { leagueCode: 'C7', matchdayId: 9 })).toMatchObject({ status: 'race_unavailable' });
  await adapter.prepare(42, { leagueCode: 'C7', period: 'season', chatId: 99 });
  expect(listUserLeagues).toHaveBeenLastCalledWith(42);
});

test('workflow race names require disambiguation, then prepare a canonical round and reject lost scores', async () => {
  setup();
  const { listUserLeagues } = require('../../leagueRegistryService');
  const { getLeagueData } = require('../../azureStorageService');
  const { fetchCurrentSeasonRaces } = require('../../raceScheduleService');
  listUserLeagues.mockResolvedValue([{ leagueCode: 'C7', leagueName: 'League' }]);
  getLeagueData.mockResolvedValue({ teams: [{ raceScores: { matchday_10: 20, matchday_2: 0 } }] });
  fetchCurrentSeasonRaces.mockResolvedValue({ MRData: { RaceTable: { Races: [
    { round: '10', raceName: 'Austrian Grand Prix' },
    { round: '2', raceName: 'Australian Grand Prix' },
  ] } } });
  const tool = {
    name: 'get_leaderboard', description: 'Standings.',
    parameters: z.object({ leagueCode: z.string(), period: z.enum(['season', 'race']).optional(), matchdayId: z.number().optional(), raceName: z.string().optional() }),
    execute: jest.fn(),
  };
  const adapter = createRegistry([tool]).get('get_leaderboard');
  const ambiguous = await adapter.prepare(42, { leagueCode: 'C7', raceName: 'Austr' });
  expect(ambiguous).toMatchObject({ status: 'selection_required', choice: 'period' });
  expect(ambiguous.options.map((option) => option.label)).toEqual(['Austrian GP', 'Australian GP']);
  const named = await adapter.prepare(42, { leagueCode: 'C7', raceName: 'Austrian Grand Prix' });
  expect(named.args).toEqual({ leagueCode: 'C7', period: 'race', matchdayId: 10 });
  expect(named.summary).toContain('Austrian GP');
  getLeagueData.mockResolvedValue({ teams: [{ totalScore: 1234, raceScores: { matchday_10: null } }] });
  expect(await adapter.revalidate(42, named)).toMatchObject({ valid: false, failure: { status: 'race_unavailable' } });
  expect(tool.execute).not.toHaveBeenCalled();
});
