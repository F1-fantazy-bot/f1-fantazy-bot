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
  CONTACT_CALLBACK_TYPE,
} = require('./constants');
const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const cache = require('./cache');
const azureStorageService = require('./azureStorageService');

jest.mock('./utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
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
}));
jest.mock('./cache', () => ({
  photoCache: {},
  currentTeamCache: {},
  constructorsCache: {},
  driversCache: {},
  bestTeamsCache: {},
  selectedChipCache: {},
  getPrintableCache: jest.fn(),
}));
jest.mock('./commandsHandler/contactUsHandler', () => ({
  handleContactCallback: jest.fn(),
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
      '```json\n{"Drivers":[{"DR":"HAM","price":30,"expectedPriceChange":2,"expectedPoints":50}]}\n```'
    );

    await handleCallbackQuery(bot, query);

    expect(bot.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('DRIVERS'),
      expect.objectContaining({ chat_id: chatId, message_id: messageId })
    );
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(query.id);
    expect(bot.getFileLink).toHaveBeenCalledWith(fileId);
    expect(cache.getPrintableCache).toHaveBeenCalledWith(
      chatId,
      DRIVERS_PHOTO_TYPE
    );
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
      '```json\n{"Constructors":[{"CN":"MER","price":50,"expectedPriceChange":3,"expectedPoints":100}]}\n```'
    );

    await handleCallbackQuery(bot, query);

    expect(cache.getPrintableCache).toHaveBeenCalledWith(
      chatId,
      CONSTRUCTORS_PHOTO_TYPE
    );
    expect(cache.constructorsCache[chatId]).toEqual({
      MER: {
        CN: 'MER',
        price: 50,
        expectedPriceChange: 3,
        expectedPoints: 100,
      },
    });
  });

  it('should handle current team photo type and store in currentTeamCache', async () => {
    query.data = `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:${fileId}`;
    extractJsonDataFromPhotos.mockResolvedValue(
      '```json\n{"CurrentTeam":{"drivers":["L. Hamilton"],"constructors":["Mercedes"],"drsBoost":"L. Hamilton","freeTransfers":2,"costCapRemaining":10}}\n```'
    );

    await handleCallbackQuery(bot, query);

    // Verify Azure Storage was updated
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      expect.any(Object), // mockBot
      chatId,
      {
        drivers: ['HAM'],
        constructors: ['MER'],
        drsBoost: 'HAM',
        freeTransfers: 2,
        costCapRemaining: 10,
      }
    );

    expect(cache.getPrintableCache).toHaveBeenCalledWith(
      chatId,
      CURRENT_TEAM_PHOTO_TYPE
    );
    expect(cache.currentTeamCache[chatId]).toEqual({
      drivers: ['HAM'],
      constructors: ['MER'],
      drsBoost: 'HAM',
      freeTransfers: 2,
      costCapRemaining: 10,
    });
  });

  it('should handle JSON parse error gracefully', async () => {
    extractJsonDataFromPhotos.mockResolvedValue('not a json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleCallbackQuery(bot, query);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Error parsing JSON:'),
      expect.anything()
    );
    spy.mockRestore();
  });

  it('should handle extractJsonDataFromPhotos error gracefully', async () => {
    extractJsonDataFromPhotos.mockRejectedValue(new Error('Extraction failed'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleCallbackQuery(bot, query);

    expect(bot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('An error occurred while extracting data')
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Error extracting data from photo:'),
      expect.any(Error)
    );
    spy.mockRestore();
  });

  describe('chip callback handling', () => {
    beforeEach(() => {
      // Reset cache before each test
      Object.keys(cache.selectedChipCache).forEach(
        (key) => delete cache.selectedChipCache[key]
      );
      Object.keys(cache.bestTeamsCache).forEach(
        (key) => delete cache.bestTeamsCache[key]
      );
    });

    it('should handle EXTRA_DRS chip selection and clear bestTeamsCache', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up bestTeamsCache with some data
      cache.bestTeamsCache[chatId] = { someData: 'test' };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toBe(EXTRA_DRS_CHIP);
      expect(cache.bestTeamsCache[chatId]).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: EXTRA_DRS.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('chipQueryId');
    });

    it('should handle WITHOUT_CHIP selection and clear both caches', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up caches with some data
      cache.selectedChipCache[chatId] = WILDCARD_CHIP;
      cache.bestTeamsCache[chatId] = { someData: 'test' };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toBeUndefined();
      expect(cache.bestTeamsCache[chatId]).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: WITHOUT_CHIP.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('chipQueryId');
    });

    it('should handle LIMITLESS chip selection and clear bestTeamsCache', async () => {
      const chipQuery = {
        message: {
          chat: { id: chatId },
          message_id: messageId,
        },
        data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
        id: 'chipQueryId',
      };

      // Set up bestTeamsCache with some data
      cache.bestTeamsCache[chatId] = { someData: 'test' };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toBe(LIMITLESS_CHIP);
      expect(cache.bestTeamsCache[chatId]).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: LIMITLESS.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
      );
      expect(bot.answerCallbackQuery).toHaveBeenCalledWith('chipQueryId');
    });

    it('should clear bestTeamsCache even when it was already empty', async () => {
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

      expect(cache.selectedChipCache[chatId]).toBe(WILDCARD_CHIP);
      expect(cache.bestTeamsCache[chatId]).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        'Selected chip: WILDCARD.',
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
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

      // Set up bestTeamsCache with bestTeams property
      cache.bestTeamsCache[chatId] = { bestTeams: [{ some: 'data' }] };

      await handleCallbackQuery(bot, chipQuery);

      expect(cache.selectedChipCache[chatId]).toBe(EXTRA_DRS_CHIP);
      expect(cache.bestTeamsCache[chatId]).toBeUndefined();
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Selected chip: EXTRA_DRS.'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Note: best team calculation was deleted'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('rerun /best_teams command'),
        expect.objectContaining({ chat_id: chatId, message_id: messageId })
      );
    });
  });

  describe('contact callback handling', () => {
    it('should forward to handleContactCallback', async () => {
      const contactQuery = {
        message: { chat: { id: chatId }, message_id: messageId },
        data: `${CONTACT_CALLBACK_TYPE}:start`,
        id: 'contactId',
      };

      const { handleContactCallback } = require('./commandsHandler/contactUsHandler');

      await handleCallbackQuery(bot, contactQuery);

      expect(handleContactCallback).toHaveBeenCalledWith(bot, contactQuery);
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
        'Unknown callback type: unknown_type'
      );
    });
  });

  describe('storeInCache edge cases', () => {
    beforeEach(() => {
      // Reset caches
      Object.keys(cache.driversCache).forEach(
        (key) => delete cache.driversCache[key]
      );
      Object.keys(cache.constructorsCache).forEach(
        (key) => delete cache.constructorsCache[key]
      );
      Object.keys(cache.currentTeamCache).forEach(
        (key) => delete cache.currentTeamCache[key]
      );
    });

    it('should handle unknown photo type and log error', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      query.data = `${PHOTO_CALLBACK_TYPE}:unknown_type:${fileId}`;
      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"someData": "test"}\n```'
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
        '```json\n{"Drivers":[{"DR":"HAM","price":30}]}\n```'
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
        '```json\n{"Constructors":[{"CN":"MER","price":50}]}\n```'
      );

      await handleCallbackQuery(bot, query);

      expect(cache.constructorsCache[chatId]).toEqual({
        FER: { CN: 'FER', price: 45 },
        MER: { CN: 'MER', price: 50 },
      });
    });

    it('should handle current team data with existing cache', async () => {
      query.data = `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:${fileId}`;

      // Pre-populate currentTeamCache
      cache.currentTeamCache[chatId] = {
        freeTransfers: 1,
        previousData: 'should be kept',
      };

      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"CurrentTeam":{"drivers":["L. Hamilton"],"constructors":["Mercedes"],"drsBoost":"L. Hamilton","freeTransfers":2,"costCapRemaining":10}}\n```'
      );

      await handleCallbackQuery(bot, query);

      expect(cache.currentTeamCache[chatId]).toEqual({
        previousData: 'should be kept',
        drivers: ['HAM'],
        constructors: ['MER'],
        drsBoost: 'HAM',
        freeTransfers: 2,
        costCapRemaining: 10,
      });
    });
  });

  describe('error handling edge cases', () => {
    it('should handle sendMessage error in success path', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      bot.sendMessage.mockRejectedValueOnce(new Error('Send message failed'));
      extractJsonDataFromPhotos.mockResolvedValue(
        '```json\n{"Drivers":[{"DR":"HAM","price":30}]}\n```'
      );

      await handleCallbackQuery(bot, query);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error sending extracted data:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle sendMessage error in error path', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      extractJsonDataFromPhotos.mockRejectedValue(
        new Error('Extraction failed')
      );
      bot.sendMessage.mockRejectedValueOnce(
        new Error('Send error message failed')
      );

      await handleCallbackQuery(bot, query);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error extracting data from photo:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error sending extraction error message:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle storeInCache with undefined jsonObject after parse error', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      extractJsonDataFromPhotos.mockResolvedValue(
        'invalid json that will fail parsing'
      );

      await handleCallbackQuery(bot, query);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error parsing JSON:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
