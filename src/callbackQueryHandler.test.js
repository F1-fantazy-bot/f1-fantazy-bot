const { handleCallbackQuery } = require('./callbackQueryHandler');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');
const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const cache = require('./cache');

jest.mock('openai', () => ({
  AzureOpenAI: jest.fn().mockImplementation((options) => ({
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
jest.mock('./cache', () => ({
  photoCache: {},
  currentTeamCache: {},
  constructorsCache: {},
  driversCache: {},
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
      data: `${type}:${fileId}`,
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
    query.data = `${CONSTRUCTORS_PHOTO_TYPE}:${fileId}`;
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
    query.data = `${CURRENT_TEAM_PHOTO_TYPE}:${fileId}`;
    extractJsonDataFromPhotos.mockResolvedValue(
      '```json\n{"CurrentTeam":{"drivers":["L. Hamilton"],"constructors":["Mercedes"],"drsBoost":"L. Hamilton","freeTransfers":2,"costCapRemaining":10}}\n```'
    );

    await handleCallbackQuery(bot, query);

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
});
