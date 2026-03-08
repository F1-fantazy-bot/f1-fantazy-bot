const { KILZI_CHAT_ID } = require('../constants');

const { getPrintableCache } = require('../cache');
jest.mock('../cache', () => ({
  getPrintableCache: jest.fn(),
  userCache: {},
}));

const { sendPrintableCache } = require('./printCacheHandler');

describe('sendPrintableCache', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send printable cache when available', async () => {
    const mockPrintableCache = '*Drivers Cache:*\nVER - 30.5M\nHAM - 25.0M';
    getPrintableCache.mockReturnValue(mockPrintableCache);

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(getPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      mockPrintableCache,
      { parse_mode: 'Markdown' },
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should send empty cache message when printable cache is not available', async () => {
    getPrintableCache.mockReturnValue(null);

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Drivers cache is empty. Please send drivers image or valid JSON data.',
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should handle sendMessage errors gracefully', async () => {
    const mockPrintableCache = '*Drivers Cache:*\nVER - 30.5M';
    getPrintableCache.mockReturnValue(mockPrintableCache);

    // Mock sendMessage to reject
    botMock.sendMessage.mockRejectedValueOnce(new Error('Network error'));

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });
});
