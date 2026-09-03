jest.mock('../userRegistryService', () => ({
  updateUserAttributesAtomically: jest.fn(),
}));

jest.mock('./activateChipService', () => ({
  runChipMutation: jest.fn(async (_chatId, operation) => await operation()),
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
  createResetUserDataService,
  STATUS,
} = require('./resetUserDataService');
const { RESET_EPOCH_FIELD } = require('./userResetEpochService');

const CHAT_ID = 42;

function seedUser() {
  driversCache[CHAT_ID] = { VER: { price: 30 } };
  constructorsCache[CHAT_ID] = { MCL: { price: 25 } };
  currentTeamCache[CHAT_ID] = { T1: { drivers: ['VER'] } };
  bestTeamsCache[CHAT_ID] = { T1: { bestTeams: [{}] } };
  selectedChipCache[CHAT_ID] = { T1: 'LIMITLESS' };
  userCache[String(CHAT_ID)] = {
    selectedTeam: 'T1',
    bestTeamBudgetChangePointsPerMillion: { T1: 1.65 },
    selectedBestTeamByTeam: {
      T1: {
        drivers: ['VER'],
        constructors: ['MCL'],
        boostDriver: 'VER',
      },
    },
    selectedChipByTeam: { T1: 'LIMITLESS' },
    [RESET_EPOCH_FIELD]: 3,
  };
}

function cleanUser() {
  for (const cache of [
    driversCache,
    constructorsCache,
    currentTeamCache,
    bestTeamsCache,
    selectedChipCache,
    userCache,
  ]) {
    delete cache[CHAT_ID];
    delete cache[String(CHAT_ID)];
  }
}

function createService({ updateAttributes, restoreState = jest.fn() } = {}) {
  const storage = {
    deleteAllUserTeams: jest.fn().mockResolvedValue(undefined),
    saveUserTeam: jest.fn().mockResolvedValue(undefined),
  };
  const update =
    updateAttributes ||
    jest.fn(async (_chatId, transform) => ({
      updated: true,
      user: await transform({ [RESET_EPOCH_FIELD]: 3 }),
    }));
  const service = createResetUserDataService({
    storage,
    updateAttributes: update,
    captureState: jest.fn(() => ({ teams: { T1: { drivers: ['VER'] } } })),
    restoreState,
  });

  return { service, storage, update, restoreState };
}

beforeEach(() => {
  jest.clearAllMocks();
  seedUser();
});

afterEach(cleanUser);

test('inspects the exact reset impact under the shared mutation boundary', async () => {
  const { service } = createService();

  await expect(service.inspect({ chatId: CHAT_ID })).resolves.toMatchObject({
    hasResettableData: true,
    impact: {
      teamBlobs: 1,
      selectedTeam: true,
      rankingPreferences: 1,
      selectedBestTeams: 1,
      chipPreferences: 1,
      driverProjectionOverride: true,
      constructorProjectionOverride: true,
    },
  });
});

test('persists reset state before publishing local cache invalidation', async () => {
  const { service, storage, update } = createService();
  const inspection = await service.inspect({ chatId: CHAT_ID });

  const result = await service.reset({
    chatId: CHAT_ID,
    expectedFingerprint: inspection.fingerprint,
  });

  expect(result).toMatchObject({
    status: STATUS.OK,
    epoch: 4,
    impact: { teamBlobs: 1, driverProjectionOverride: true },
  });
  expect(storage.deleteAllUserTeams).toHaveBeenCalledWith(CHAT_ID);
  expect(update).toHaveBeenCalledTimes(2);
  expect(update.mock.calls[0][1]({})).toEqual({
    selectedTeam: null,
    bestTeamBudgetChangePointsPerMillion: null,
    selectedBestTeamByTeam: null,
    selectedChipByTeam: null,
  });
  expect(update.mock.calls[1][1]({ [RESET_EPOCH_FIELD]: 3 })).toEqual({
    [RESET_EPOCH_FIELD]: 4,
  });
  expect(driversCache[CHAT_ID]).toBeUndefined();
  expect(constructorsCache[CHAT_ID]).toBeUndefined();
  expect(currentTeamCache[CHAT_ID]).toBeUndefined();
  expect(bestTeamsCache[CHAT_ID]).toBeUndefined();
  expect(selectedChipCache[CHAT_ID]).toBeUndefined();
  expect(userCache[String(CHAT_ID)]).toMatchObject({
    selectedTeam: null,
    bestTeamBudgetChangePointsPerMillion: {},
    selectedBestTeamByTeam: {},
    selectedChipByTeam: {},
    [RESET_EPOCH_FIELD]: 4,
  });
});

test('refuses a confirmed reset if the inspected durable-state fingerprint changed', async () => {
  const { service, storage, update } = createService();

  const result = await service.reset({
    chatId: CHAT_ID,
    expectedFingerprint: 'different-state',
  });

  expect(result.status).toBe(STATUS.CHANGED);
  expect(storage.deleteAllUserTeams).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(currentTeamCache[CHAT_ID]).toEqual({ T1: { drivers: ['VER'] } });
});

test('compensates from the snapshot when a durable reset write fails', async () => {
  const update = jest
    .fn()
    .mockResolvedValueOnce({ updated: true })
    .mockRejectedValueOnce(new Error('epoch CAS unavailable'));
  const restoreState = jest.fn().mockResolvedValue(undefined);
  const { service, storage } = createService({ updateAttributes: update, restoreState });

  await expect(service.reset({ chatId: CHAT_ID })).rejects.toThrow(
    'epoch CAS unavailable',
  );
  expect(storage.deleteAllUserTeams).toHaveBeenCalledWith(CHAT_ID);
  expect(restoreState).toHaveBeenCalledWith(
    CHAT_ID,
    { teams: { T1: { drivers: ['VER'] } } },
  );
  expect(currentTeamCache[CHAT_ID]).toEqual({ T1: { drivers: ['VER'] } });
});
