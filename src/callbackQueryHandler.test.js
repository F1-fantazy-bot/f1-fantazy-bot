const { handleCallbackQuery } = require('./callbackQueryHandler');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  PHOTO_CALLBACK_TYPE,
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
  LANG_CALLBACK_TYPE,
  TEAM_CALLBACK_TYPE,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
} = require('./constants');
const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const cache = require('./cache');
const azureStorageService = require('./azureStorageService');
const { updateUserAttributes } = require('./userRegistryService');
const { t, getLanguage, getLanguageName } = require('./i18n');

jest.mock('./utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  sendMessageToUser: jest.fn().mockResolvedValue(undefined),
  getDisplayName: jest.fn().mockReturnValue('TestUser'),
}));

jest.mock('openai', () => ({
  AzureOpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Mocked response',
              },
            },
          ],
        }),
      },
    },
  })),
}));

jest.mock('./jsonDataExtraction');
jest.mock('./azureStorageService', () => ({
  saveUserTeam: jest.fn().mockResolvedValue(undefined),
  deleteUserTeam: jest.fn().mockResolvedValue(undefined),
  deleteAllUserTeams: jest.fn().mockResolvedValue(undefined),
  savePendingTeamAssignment: jest.fn().mockResolvedValue(undefined),
  getPendingTeamAssignment: jest.fn().mockResolvedValue(null),
  deletePendingTeamAssignment: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./cache', () => ({
  photoCache: {},
  currentTeamCache: {},
  constructorsCache: {},
  driversCache: {},
  bestTeamsCache: {},
  selectedChipCache: {},
  userCache: {},
  getPrintableCache: jest.fn(),
  getSelectedTeam: jest.fn().mockReturnValue(null),
  getUserTeamIds: jest.fn().mockReturnValue([]),
  resolveSelectedTeam: jest.fn().mockResolvedValue('T1'),
  normalizeBestTeamPointsWeights: jest.fn((rawValue) => {
    if (!rawValue) {
      return {};
    }

    if (typeof rawValue === 'string') {
      try {
        return JSON.parse(rawValue);
      } catch {
        return {};
      }
    }

    return typeof rawValue === 'object' ? rawValue : {};
  }),
}));

describe('handleCallbackQuery', () => {
  let bot;
  let query;
  let chatId;
  let messageId;
  let fileId;
  let type;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    chatId = 123;
    messageId = 456;
    fileId = 'file123';
    type = DRIVERS_PHOTO_TYPE;

    cache.photoCache[fileId] = { fileId };

    bot = {
      editMessageText: jest.fn(),
      answerCallbackQuery: jest.fn(),
      getFileLink: jest.fn().mockResolvedValue('http://file.link/photo.jpg'),
      sendMessage: jest.fn().mockResolvedValue(),
    };

    query = {
      message: {
        chat: { id: chatId },
        message_id: messageId,
      },
      data: `${PHOTO_CALLBACK_TYPE}:${type}:${fileId}`,
      id: 'queryId',
    };

    extractJsonDataFromPhotos.mockReset();
    bot.editMessageText.mockClear();
    bot.answerCallbackQuery.mockClear();
    bot.getFileLink.mockClear();
    bot.sendMessage.mockClear();
  });

  it('should handle driver photo type and store in driversCache', async () => {
    extractJsonDataFromPhotos.mockResolvedValue(
      '```json\n{"Drivers":[{"DR":"HAM","price":30,"expectedPriceChange":2,"expectedPoints":50}]}\n```',
    );

    await handleCallbackQuery(bot, query);

    expect(bot.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('DRIVERS'),
      expect.objectContaining({ chat_id: chatId, message_id: messageId }),
    );
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(query.id);
    expect(bot.getFileLink).toHaveBeenCalledWith(fileId);
    expect(cache.driversCache[chatId]).toEqual({
      HAM: {
        DR: 'HAM',
        price: 30,
        expectedPriceChange: 2,
        expectedPoints: 50,
      },
    });
  });

  it('should handle constructors photo type and store in constructorsCache', async () => {
    query.data = `${PHOTO_CALLBACK_TYPE}:${CONSTRUCTORS_PHOTO_TYPE}:${fileId}`;
    extractJsonDataFromPhotos.mockResolvedValue(
      '```json\n{"Constructors":[{"CN":"MER","price":50,"expectedPriceChange":3,"expectedPoints":100}]}\n```',
    );

    await handleCallbackQuery(bot, query);

    expect(cache.constructorsCache[chatId]).toEqual({
      MER: {
        CN: 'MER',
        price: 50,
        expectedPriceChange: 3,
        expectedPoints: 100,
      },
    });
  });

  it('should handle current team photo type with teamId and store nested in currentTeamCache', async () => {
    query.data = `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:${fileId}`;
    extractJsonDataFromPhotos.mockResolvedValue(
      '```json\n{"CurrentTeam":{"teamId":"T1","drivers":["L. Hamilton"],"constructors":["Mercedes"],"drsBoost":"L. Hamilton","freeTransfers":2,"costCapRemaining":10}}\n```',
    );

    await handleCallbackQuery(bot, query);

    // Verify Azure Storage was updated with teamId
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      expect.any(Object), // mockBot
      chatId,
      'T1',
      {
        drivers: ['HAM'],
        constructors: ['MER'],
        drsBoost: 'HAM',
        freeTransfers: 2,
        costCapRemaining: 10,
      },
    );

    // Team data stored nested under T1
    expect(cache.currentTeamCache[chatId]['T1']).toEqual({
      drivers: ['HAM'],
      constructors: ['MER'],
      drsBoost: 'HAM',
      freeTransfers: 2,
      costCapRemaining: 10,
    });

    // Auto-select was set
    expect(updateUserAttributes).toHaveBeenCalledWith(chatId, {
      selectedTeam: 'T1',
    });
  });

  it('should ask user to assign team when teamId is null', async () => {
    query.data = `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:${fileId}`;
    extractJsonDataFromPhotos.mockResolvedValue(
      '```json\n{"CurrentTeam":{"drivers":["L. Hamilton"],"constructors":["Mercedes"],"drsBoost":"L. Hamilton","freeTransfers":2,"costCapRemaining":10}}\n```',
    );

    await handleCallbackQuery(bot, query);

    // Should save pending team assignment to Azure Blob Storage
    expect(azureStorageService.savePendingTeamAssignment).toHaveBeenCalledWith(
      chatId,
      fileId,
      expect.objectContaining({
        drivers: expect.any(Array),
        constructors: expect.any(Array),
      }),
    );

    // Should send team assignment keyboard
    expect(bot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.any(String), // "Which team is this screenshot from?"
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      }),
    );

    // saveUserTeam should NOT have been called (deferred)
    expect(azureStorageService.saveUserTeam).not.toHaveBeenCalled();
  });

  it('should handle JSON parse error gracefully', async () => {
    extractJsonDataFromPhotos.mockResolvedValue('not a json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleCallbackQuery(bot, query);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] JSON.parse FAILED. Error:'),
      expect.anything(),
    );
    spy.mockRestore();
  });

  it('should handle extractJsonDataFromPhotos error gracefully', async () => {
    extractJsonDataFromPhotos.mockRejectedValue(new Error('Extraction failed'));

    await handleCallbackQuery(bot, query);

    expect(require('./utils').sendMessageToUser).toHaveBeenCalledWith(
      bot,
      chatId,
      expect.stringContaining('An error occurred while extracting data'),
      { errorMessageToLog: 'Error sending extraction error message' },
    );
    expect(require('./utils').sendLogMessage).toHaveBeenCalledWith(
      bot,
      'Error extracting data from photo: Extraction failed',
    );
  });

  describe('chip callback handling', () => {
    beforeEach(() => {
      // Reset cache before each test
      Object.keys(cache.selectedChipCache).forEach(
        (key) => delete cache.selectedChipCache[key],
      );
      Object.keys(cache.bestTeamsCache).forEach(
        (key) => delete cache.bestTeamsCache[key],
      );
      Object.keys(cache.currentTeamCache).forEach(
        (key) => delete cache.currentTeamCache[key],
      );
      // Set up a single team so resolveSelectedTeam auto-resolves
      cache.currentTeamCache[chatId] = { T1: { drivers: ['VER'] } };
      cache.resolveSelectedTeam.mockResolvedValue('T1');
    });

    it('should handle EXTRA_DRS chip selection and clear bestTeamsCache for team', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up bestTeamsCache with some data
      cache.bestTeamsCache[chatId] = { T1: { someData: 'test' } };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toEqual({ T1: EXTRA_DRS_CHIP });
      expect(cache.bestTeamsCache[chatId]['T1']).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: EXTRA_DRS.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('chipQueryId');
    });

    it('should handle WITHOUT_CHIP selection and clear chip for team', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up caches with some data
      cache.selectedChipCache[chatId] = { T1: WILDCARD_CHIP };
      cache.bestTeamsCache[chatId] = { T1: { someData: 'test' } };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]['T1']).toBeUndefined();
      expect(cache.bestTeamsCache[chatId]['T1']).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: WITHOUT_CHIP.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('chipQueryId');
    });

    it('should handle LIMITLESS chip selection and clear bestTeamsCache for team', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up bestTeamsCache with some data
      cache.bestTeamsCache[chatId] = { T1: { someData: 'test' } };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toEqual({ T1: LIMITLESS_CHIP });
      expect(cache.bestTeamsCache[chatId]['T1']).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: LIMITLESS.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('chipQueryId');
    });

    it('should clear bestTeamsCache for team even when it was already empty', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`,
        id: 'chipQueryId',
      };

      // bestTeamsCache is already empty
      expect(cache.bestTeamsCache[chatId]).toBeUndefined();

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toEqual({ T1: WILDCARD_CHIP });
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: WILDCARD.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
    });

    it('should include best teams recalculation message when best teams cache has data with bestTeams property', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up bestTeamsCache with bestTeams property (nested under T1)
      cache.bestTeamsCache[chatId] = { T1: { bestTeams: [{ some: 'data' }] } };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toEqual({ T1: EXTRA_DRS_CHIP });
      expect(cache.bestTeamsCache[chatId]['T1']).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Selected chip: EXTRA_DRS.'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Note: best team calculation was deleted'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('rerun /best_teams command'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
    });
  });

  describe('language selection handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      Object.keys(cache.userCache).forEach(
        (key) => delete cache.userCache[key],
      );
    });

    it('should set language and edit message', async () => {
      const langQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${LANG_CALLBACK_TYPE}:he`,
        id: 'langQueryId',
      };

      await handleCallbackQuery(bot, langQuery);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        t('Language changed to {LANG}.', chatId, {
          LANG: getLanguageName('he', chatId),
        }),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('langQueryId');
      expect(getLanguage(chatId)).toBe('he');
      expect(updateUserAttributes).toHaveBeenCalledWith(chatId, { lang: 'he' });
    });
  });


  describe('best team weights callback handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      Object.keys(cache.userCache).forEach((key) => delete cache.userCache[key]);
    });

    it('should handle BEST_TEAM_WEIGHTS callback and persist selected preset', async () => {
      cache.bestTeamsCache[chatId] = { T2: { bestTeams: [{ a: 1 }] } };

      const weightsQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T2:points_70`,
        id: 'weightsQueryId',
      };

      await handleCallbackQuery(bot, weightsQuery);

      expect(updateUserAttributes).toHaveBeenCalledWith(chatId, {
        bestTeamPointsWeights: JSON.stringify({
          T2: 0.7,
        }),
      });
      expect(cache.userCache[String(chatId)]).toEqual(
        expect.objectContaining({
          bestTeamPointsWeights: {
            T2: 0.7,
          },
        }),
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining(
          'Best team weights set: points 70% | price change 30%.',
        ),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('rerun /best_teams command'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(cache.bestTeamsCache[chatId]['T2']).toBeUndefined();
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('weightsQueryId');
    });

    it('should update bestTeamPointsWeights when userCache has JSON string', async () => {
      cache.userCache[String(chatId)] = {
        bestTeamPointsWeights: JSON.stringify({
          T1: 0.25,
        }),
      };

      const weightsQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T2:points_70`,
        id: 'weightsQueryId',
      };

      await handleCallbackQuery(bot, weightsQuery);

      expect(updateUserAttributes).toHaveBeenCalledWith(chatId, {
        bestTeamPointsWeights: JSON.stringify({
          T1: 0.25,
          T2: 0.7,
        }),
      });
      expect(cache.userCache[String(chatId)]).toEqual(
        expect.objectContaining({
          bestTeamPointsWeights: {
            T1: 0.25,
            T2: 0.7,
          },
        }),
      );
    });

  });

  describe('team callback handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      Object.keys(cache.userCache).forEach(
        (key) => delete cache.userCache[key],
      );
    });

    it('should handle TEAM callback and update selectedTeam', async () => {
      const teamQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${TEAM_CALLBACK_TYPE}:T2`,
        id: 'teamQueryId',
      };

      await handleCallbackQuery(bot, teamQuery);

      expect(cache.userCache[String(chatId)].selectedTeam).toBe('T2');
      expect(updateUserAttributes).toHaveBeenCalledWith(chatId, {
        selectedTeam: 'T2',
      });
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('T2'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId }),
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('teamQueryId');
    });
  });

  describe('unknown callback type handling', () => {
    it('should handle unknown callback type and call sendLogMessage', async () => {
      const unknownQuery = {
        data: 'unknown_type:some_data',
      };

      await handleCallbackQuery(bot, unknownQuery);

      expect(require('./utils').sendLogMessage).toHaveBeenCalledWith(
        bot,
        'Unknown callback type: unknown_type',
      );
    });
  });

  describe('storeInCache edge cases', () => {
    beforeEach(() => {
      // Reset caches
      Object.keys(cache.driversCache).forEach(
        (key) => delete cache.driversCache[key],
      );
      Object.keys(cache.constructorsCache).forEach(
        (key) => delete cache.constructorsCache[key],
      );
      Object.keys(cache.currentTeamCache).forEach(
        (key) => delete cache.currentTeamCache[key],
      );
    });

    it('should handle unknown photo type and log error', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      query.data = `${PHOTO_CALLBACK_TYPE}:unknown_type:${fileId}`;
      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"someData": "test"}\n```',
      );

      await handleCallbackQuery(bot, query);

      expect(spy).toHaveBeenCalledWith('Unknown photo type:', 'unknown_type');
      spy.mockRestore();
    });

    it('should handle drivers data with existing cache', async () => {
      // Pre-populate driversCache
      cache.driversCache[chatId] = {
        VER: { DR: 'VER', price: 25 },
      };

      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"Drivers":[{"DR":"HAM","price":30}]}\n```',
      );

      await handleCallbackQuery(bot, query);

      expect(cache.driversCache[chatId]).toEqual({
        VER: { DR: 'VER', price: 25 },
        HAM: { DR: 'HAM', price: 30 },
      });
    });

    it('should handle constructors data with existing cache', async () => {
      query.data = `${PHOTO_CALLBACK_TYPE}:${CONSTRUCTORS_PHOTO_TYPE}:${fileId}`;

      // Pre-populate constructorsCache
      cache.constructorsCache[chatId] = {
        FER: { CN: 'FER', price: 45 },
      };

      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"Constructors":[{"CN":"MER","price":50}]}\n```',
      );

      await handleCallbackQuery(bot, query);

      expect(cache.constructorsCache[chatId]).toEqual({
        FER: { CN: 'FER', price: 45 },
        MER: { CN: 'MER', price: 50 },
      });
    });
  });

  describe('error handling edge cases', () => {
    it('should handle sendMessage error in success path for current team photo', async () => {
      query.data = `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:${fileId}`;

      // First sendMessageToUser for auto-switch succeeds, second (printable cache) fails
      const { sendMessageToUser } = require('./utils');
      sendMessageToUser
        .mockResolvedValueOnce(undefined) // auto-switch message
        .mockRejectedValueOnce(new Error('Send message failed')); // printable cache send

      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"CurrentTeam":{"teamId":"T1","drivers":["L. Hamilton"],"constructors":["Mercedes"],"drsBoost":"L. Hamilton","freeTransfers":2,"costCapRemaining":10}}\n```',
      );

      await handleCallbackQuery(bot, query);

      expect(require('./utils').sendLogMessage).toHaveBeenCalledWith(
        bot,
        'Error extracting data from photo: Send message failed',
      );
    });

    it('should handle sendMessage error in error path', async () => {
      extractJsonDataFromPhotos.mockRejectedValue(
        new Error('Extraction failed'),
      );
      bot.sendMessage.mockRejectedValueOnce(
        new Error('Send error message failed'),
      );

      await handleCallbackQuery(bot, query);

      expect(require('./utils').sendLogMessage).toHaveBeenCalledWith(
        bot,
        'Error extracting data from photo: Extraction failed',
      );
    });

    it('should handle storeInCache with undefined jsonObject after parse error', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      extractJsonDataFromPhotos.mockResolvedValue(
        'invalid json that will fail parsing',
      );

      await handleCallbackQuery(bot, query);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[DEBUG] JSON.parse FAILED. Error:',
        expect.any(String),
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
