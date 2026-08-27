jest.mock('../azureStorageService', () => ({
  deleteAllUserTeams: jest.fn(),
  saveUserTeam: jest.fn(),
}));
jest.mock('../userRegistryService', () => ({
  updateUserAttributesAtomically: jest.fn(),
}));
jest.mock('./selectTeamService', () => ({
  setCachedSelectedTeam: jest.fn(),
}));
jest.mock('./setBestTeamRankingService', () => ({
  setCachedRankingPreferences: jest.fn(),
}));
jest.mock('./activateChipService', () => ({
  setCachedChipPreferences: jest.fn(),
}));

const azureStorageService = require('../azureStorageService');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  currentTeamCache,
  bestTeamsCache,
  userCache,
} = require('../cache');
const {
  setCachedSelectedTeam,
} = require('./selectTeamService');
const {
  setCachedRankingPreferences,
} = require('./setBestTeamRankingService');
const {
  setCachedChipPreferences,
} = require('./activateChipService');
const {
  captureTeamState,
  restoreTeamState,
} = require('./teamStateSnapshotService');

beforeEach(() => {
  jest.clearAllMocks();
  currentTeamCache[42] = { T1: { drivers: ['VER'] } };
  bestTeamsCache[42] = { T1: { bestTeams: [] } };
  userCache['42'] = {
    selectedTeam: 'T1',
    bestTeamBudgetChangePointsPerMillion: { T1: 1.3 },
    selectedBestTeamByTeam: {},
    selectedChipByTeam: { T1: 'EXTRA_BOOST' },
  };
  azureStorageService.deleteAllUserTeams.mockResolvedValue(undefined);
  azureStorageService.saveUserTeam.mockResolvedValue(undefined);
  updateUserAttributesAtomically.mockResolvedValue({ updated: true });
});

afterEach(() => {
  delete currentTeamCache[42];
  delete bestTeamsCache[42];
  delete userCache['42'];
});

test('captures and restores durable and local team state', async () => {
  const snapshot = captureTeamState(42);
  delete currentTeamCache[42];
  delete bestTeamsCache[42];

  await restoreTeamState({}, 42, snapshot);

  expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
    {},
    42,
    'T1',
    { drivers: ['VER'] },
  );
  expect(updateUserAttributesAtomically).toHaveBeenCalledWith(
    42,
    expect.any(Function),
  );
  expect(setCachedRankingPreferences).toHaveBeenCalledWith(
    42,
    { T1: 1.3 },
    {},
    null,
  );
  expect(setCachedChipPreferences).toHaveBeenCalledWith(
    42,
    { T1: 'EXTRA_BOOST' },
    null,
  );
  expect(setCachedSelectedTeam).toHaveBeenCalledWith(42, 'T1', {
    preserveNull: true,
  });
  expect(currentTeamCache[42]).toEqual({ T1: { drivers: ['VER'] } });
});
