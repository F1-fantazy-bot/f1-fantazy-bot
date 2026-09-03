jest.mock('./activateChipService', () => ({
  setCachedChipPreferences: jest.fn(),
}));
jest.mock('./setBestTeamRankingService', () => ({
  setCachedRankingPreferences: jest.fn(),
}));
jest.mock('./selectTeamService', () => ({
  setCachedSelectedTeam: jest.fn(),
}));

const {
  bestTeamsCache,
  constructorsCache,
  currentTeamCache,
  driversCache,
  selectedChipCache,
  userCache,
} = require('../cache');
const {
  RESET_EPOCH_FIELD,
  reconcileUserResetEpoch,
} = require('./userResetEpochService');

beforeEach(() => {
  driversCache[42] = { VER: {} };
  constructorsCache[42] = { MCL: {} };
  currentTeamCache[42] = { T1: {} };
  bestTeamsCache[42] = { T1: {} };
  selectedChipCache[42] = { T1: 'LIMITLESS' };
  userCache['42'] = {
    selectedTeam: 'T1',
    bestTeamBudgetChangePointsPerMillion: { T1: 1.3 },
    selectedBestTeamByTeam: { T1: {} },
    selectedChipByTeam: { T1: 'LIMITLESS' },
    [RESET_EPOCH_FIELD]: 2,
  };
});

afterEach(() => {
  for (const cache of [
    driversCache,
    constructorsCache,
    currentTeamCache,
    bestTeamsCache,
    selectedChipCache,
    userCache,
  ]) {
    delete cache[42];
    delete cache['42'];
  }
});

test('drops stale user-scoped caches when another process published a newer epoch', () => {
  expect(
    reconcileUserResetEpoch(42, { [RESET_EPOCH_FIELD]: 3 }),
  ).toEqual({ changed: true, epoch: 3 });

  expect(driversCache[42]).toBeUndefined();
  expect(constructorsCache[42]).toBeUndefined();
  expect(currentTeamCache[42]).toBeUndefined();
  expect(bestTeamsCache[42]).toBeUndefined();
  expect(selectedChipCache[42]).toBeUndefined();
  expect(userCache['42']).toMatchObject({
    selectedTeam: null,
    bestTeamBudgetChangePointsPerMillion: {},
    selectedBestTeamByTeam: {},
    selectedChipByTeam: {},
    [RESET_EPOCH_FIELD]: 3,
  });
});

test('does not clear current data for an unchanged or older durable epoch', () => {
  expect(
    reconcileUserResetEpoch(42, { [RESET_EPOCH_FIELD]: 2 }),
  ).toEqual({ changed: false, epoch: 2 });
  expect(currentTeamCache[42]).toEqual({ T1: {} });
});
