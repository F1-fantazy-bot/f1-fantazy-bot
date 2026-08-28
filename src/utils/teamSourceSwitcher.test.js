jest.mock('../azureStorageService', () => ({
  deleteAllUserTeams: jest.fn(),
  saveUserTeam: jest.fn(),
}));
jest.mock('../services/selectTeamService', () => ({
  setCachedSelectedTeam: jest.fn(),
}));
jest.mock('../services/activateChipService', () => ({
  runChipMutation: jest.fn(async (_chatId, operation) => operation()),
  clearAllTeamDerivedPreferencesInternal: jest.fn(),
}));

const azureStorageService = require('../azureStorageService');
const {
  currentTeamCache,
  bestTeamsCache,
} = require('../cache');
const {
  setCachedSelectedTeam,
} = require('../services/selectTeamService');
const {
  runChipMutation,
  clearAllTeamDerivedPreferencesInternal,
} = require('../services/activateChipService');
const {
  wipeAllTeams,
  ensureSourceIsLeagueWithStorage,
} = require('./teamSourceSwitcher');

beforeEach(() => {
  jest.clearAllMocks();
  currentTeamCache[42] = { T1: { drivers: ['VER'] } };
  bestTeamsCache[42] = { T1: { bestTeams: [] } };
  azureStorageService.deleteAllUserTeams.mockResolvedValue(undefined);
  azureStorageService.saveUserTeam.mockResolvedValue(undefined);
  clearAllTeamDerivedPreferencesInternal.mockResolvedValue(undefined);
});

afterEach(() => {
  delete currentTeamCache[42];
  delete bestTeamsCache[42];
});

test('serializes the full source wipe and clears preferences last', async () => {
  await wipeAllTeams({}, 42);

  expect(runChipMutation).toHaveBeenCalledWith(42, expect.any(Function));
  expect(
    azureStorageService.deleteAllUserTeams.mock.invocationCallOrder[0],
  ).toBeLessThan(
    clearAllTeamDerivedPreferencesInternal.mock.invocationCallOrder[0],
  );
  expect(currentTeamCache[42]).toBeUndefined();
  expect(bestTeamsCache[42]).toBeUndefined();
  expect(setCachedSelectedTeam).toHaveBeenCalledWith(42, null);
});

test('keeps preferences and cache when blob deletion fails', async () => {
  azureStorageService.deleteAllUserTeams.mockRejectedValue(
    new Error('blob unavailable'),
  );

  await expect(wipeAllTeams({}, 42)).rejects.toThrow('blob unavailable');
  expect(clearAllTeamDerivedPreferencesInternal).not.toHaveBeenCalled();
  expect(currentTeamCache[42]).toBeDefined();
});

test('restores team blobs when preference clearing fails', async () => {
  clearAllTeamDerivedPreferencesInternal.mockRejectedValue(
    new Error('CAS unavailable'),
  );
  const bot = {};

  await expect(wipeAllTeams(bot, 42)).rejects.toThrow('CAS unavailable');
  expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
    bot,
    42,
    'T1',
    { drivers: ['VER'] },
  );
  expect(currentTeamCache[42]).toBeDefined();
});

test('switches source through an explicit bot-free storage port', async () => {
  const storage = {
    deleteAllUserTeams: jest.fn().mockResolvedValue(undefined),
    saveUserTeam: jest.fn().mockResolvedValue(undefined),
  };

  await expect(
    ensureSourceIsLeagueWithStorage(42, storage),
  ).resolves.toBe(true);
  expect(storage.deleteAllUserTeams).toHaveBeenCalledWith(42);
});
