jest.mock('../azureStorageService', () => ({
  listUserTeamData: jest.fn(),
}));
jest.mock('../userRegistryService', () => ({
  getUserById: jest.fn(),
}));

const { listUserTeamData } = require('../azureStorageService');
const { getUserById } = require('../userRegistryService');
const {
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
} = require('../cache');
const {
  hydrateUserMutationState,
} = require('./userMutationHydrationService');

beforeEach(() => {
  jest.clearAllMocks();
  listUserTeamData.mockResolvedValue({
    T1: { drivers: ['VER'] },
  });
  getUserById.mockResolvedValue({
    selectedTeam: 'removed',
    bestTeamBudgetChangePointsPerMillion: '{"T1":1.3,"removed":2}',
    selectedBestTeamByTeam: '{"removed":{"drivers":["VER"]}}',
    selectedChipByTeam: '{"T1":"EXTRA_BOOST","removed":"LIMITLESS"}',
  });
  bestTeamsCache[42] = { T1: { bestTeams: [] } };
});

afterEach(() => {
  delete currentTeamCache[42];
  delete bestTeamsCache[42];
  delete selectedChipCache[42];
  delete userCache['42'];
});

test('hydrates authoritative teams and filters orphaned per-team state', async () => {
  await hydrateUserMutationState(42);

  expect(currentTeamCache[42]).toEqual({
    T1: { drivers: ['VER'] },
  });
  expect(bestTeamsCache[42]).toBeUndefined();
  expect(userCache['42']).toMatchObject({
    bestTeamBudgetChangePointsPerMillion: { T1: 1.3 },
    selectedBestTeamByTeam: {},
    selectedChipByTeam: { T1: 'EXTRA_BOOST' },
  });
  expect(userCache['42'].selectedTeam).toBeUndefined();
  expect(selectedChipCache[42]).toEqual({ T1: 'EXTRA_BOOST' });
});

test('preserves best-team cache when authoritative dependencies are unchanged', async () => {
  currentTeamCache[42] = { T1: { drivers: ['VER'] } };
  userCache['42'] = {
    bestTeamBudgetChangePointsPerMillion: { T1: 1.3 },
    selectedChipByTeam: { T1: 'EXTRA_BOOST' },
  };
  bestTeamsCache[42] = { T1: { bestTeams: ['cached'] } };
  getUserById.mockResolvedValue({
    selectedTeam: 'T1',
    bestTeamBudgetChangePointsPerMillion: '{"T1":1.3}',
    selectedChipByTeam: '{"T1":"EXTRA_BOOST"}',
  });

  await hydrateUserMutationState(42);

  expect(bestTeamsCache[42]).toEqual({
    T1: { bestTeams: ['cached'] },
  });
});
