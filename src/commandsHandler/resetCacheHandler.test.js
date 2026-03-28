const { KILZI_CHAT_ID } = require('../constants');

const azureStorageService = require('../azureStorageService');
jest.mock('../azureStorageService', () => ({
  deleteAllUserTeams: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));

const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
} = require('../cache');
const { updateUserAttributes } = require('../userRegistryService');

const { resetCacheForChat } = require('./resetCacheHandler');

describe('resetCacheForChat', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    azureStorageService.deleteAllUserTeams.mockClear();
    azureStorageService.deleteAllUserTeams.mockResolvedValue(undefined);
    botMock.sendMessage.mockResolvedValue();
    delete userCache[String(KILZI_CHAT_ID)];
  });

  it('should handle /reset_cache command and send reset confirmation', async () => {
    // Set up cache before resetting
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: { drivers: ['VER'], constructors: ['RBR'] },
    };
    bestTeamsCache[KILZI_CHAT_ID] = { T1: { bestTeams: [] } };
    selectedChipCache[KILZI_CHAT_ID] = { T1: 'LIMITLESS_CHIP' };
    userCache[String(KILZI_CHAT_ID)] = {
      selectedTeam: 'T1',
      bestTeamBudgetChangePointsPerMillion: { T1: 1.65 },
      selectedBestTeamByTeam: {
        T1: {
          drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
          constructors: ['RBR', 'FER'],
          boostDriver: 'VER',
        },
      },
    };

    await resetCacheForChat(KILZI_CHAT_ID, botMock);

    // Verify Azure Storage teams were deleted
    expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Cache has been reset for your chat.',
    );

    // Verify all cache entries were deleted
    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(constructorsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(bestTeamsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(selectedChipCache[KILZI_CHAT_ID]).toBeUndefined();

    // Verify selectedTeam was cleared
    expect(userCache[String(KILZI_CHAT_ID)].selectedTeam).toBeNull();
    expect(
      userCache[String(KILZI_CHAT_ID)].bestTeamBudgetChangePointsPerMillion,
    ).toEqual({});
    expect(userCache[String(KILZI_CHAT_ID)].selectedBestTeamByTeam).toEqual({});
    expect(updateUserAttributes).toHaveBeenCalledWith(KILZI_CHAT_ID, {
      selectedTeam: null,
      bestTeamBudgetChangePointsPerMillion: null,
      selectedBestTeamByTeam: null,
    });
  });

  it('should reset cache even when some cache entries are already undefined', async () => {
    // Only set some cache entries
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    currentTeamCache[KILZI_CHAT_ID] = { T1: { drivers: ['VER'] } };
    // constructorsCache, bestTeamsCache, selectedChipCache are undefined

    await resetCacheForChat(KILZI_CHAT_ID, botMock);

    expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Cache has been reset for your chat.',
    );

    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeUndefined();
  });

  it('should propagate Azure Storage errors', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };

    // Mock Azure Storage to throw an error
    azureStorageService.deleteAllUserTeams.mockRejectedValueOnce(
      new Error('Azure error'),
    );

    await expect(resetCacheForChat(KILZI_CHAT_ID, botMock)).rejects.toThrow(
      'Azure error',
    );

    // Cache should still be cleared before the Azure call
    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(constructorsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeUndefined();
  });

  it('should handle sendMessage errors gracefully', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };

    // Mock sendMessage to reject
    botMock.sendMessage.mockRejectedValueOnce(new Error('Send message error'));

    await resetCacheForChat(KILZI_CHAT_ID, botMock);

    // Cache should still be cleared even if message sending fails
    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalled();
  });

  it('should not affect other chat caches', async () => {
    const otherChatId = 'other_chat_id';

    // Set up cache for multiple chats
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    driversCache[otherChatId] = { HAM: { price: 25.0 } };
    currentTeamCache[KILZI_CHAT_ID] = { T1: { drivers: ['VER'] } };
    currentTeamCache[otherChatId] = { T1: { drivers: ['HAM'] } };

    await resetCacheForChat(KILZI_CHAT_ID, botMock);

    // Verify only the specified chat cache was cleared
    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeUndefined();

    // Other chat cache should remain intact
    expect(driversCache[otherChatId]).toEqual({ HAM: { price: 25.0 } });
    expect(currentTeamCache[otherChatId]).toEqual({ T1: { drivers: ['HAM'] } });
  });
});
