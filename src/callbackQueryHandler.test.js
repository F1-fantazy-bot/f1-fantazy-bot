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
} = require('./constants');
const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const cache = require('./cache');
const azureStorageService = require('./azureStorageService');

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
  });
});
