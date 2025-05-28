const { KILZI_CHAT_ID } = require('../constants');

const { getPrintableCache, selectedChipCache } = require('../cache');
jest.mock('../cache', () => ({
  getPrintableCache: jest.fn(),
  selectedChipCache: {},
}));

const { sendPrintableCache } = require('./printCacheHandler');

describe('sendPrintableCache', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete selectedChipCache[KILZI_CHAT_ID];
  });

  it('should send printable cache and selected chip when both available', async () => {
    const mockPrintableCache = '*Drivers Cache:*\nVER - 30.5M\nHAM - 25.0M';
    getPrintableCache.mockReturnValue(mockPrintableCache);
    selectedChipCache[KILZI_CHAT_ID] = 'LIMITLESS_CHIP';

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(getPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      mockPrintableCache,
      { parse_mode: 'Markdown' }
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Selected Chip: LIMITLESS_CHIP'
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should send empty cache message when printable cache is not available', async () => {
    getPrintableCache.mockReturnValue(null);
    selectedChipCache[KILZI_CHAT_ID] = 'EXTRA_DRS_CHIP';

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Drivers cache is empty. Please send drivers image or valid JSON data.'
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Selected Chip: EXTRA_DRS_CHIP'
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should send no chip message when chip is not selected', async () => {
    const mockPrintableCache = '*Drivers Cache:*\nVER - 30.5M';
    getPrintableCache.mockReturnValue(mockPrintableCache);
    // selectedChipCache[KILZI_CHAT_ID] is undefined

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      mockPrintableCache,
      { parse_mode: 'Markdown' }
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'No chip selected.'
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should send both empty cache and no chip messages when neither available', async () => {
    getPrintableCache.mockReturnValue(null);
    // selectedChipCache[KILZI_CHAT_ID] is undefined

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Drivers cache is empty. Please send drivers image or valid JSON data.'
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'No chip selected.'
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should handle sendMessage errors gracefully', async () => {
    const mockPrintableCache = '*Drivers Cache:*\nVER - 30.5M';
    getPrintableCache.mockReturnValue(mockPrintableCache);
    selectedChipCache[KILZI_CHAT_ID] = 'WILDCARD_CHIP';

    // Mock sendMessage to reject on first call
    botMock.sendMessage.mockRejectedValueOnce(new Error('Network error'));

    await sendPrintableCache(KILZI_CHAT_ID, botMock);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
    // Second call should still succeed
    expect(botMock.sendMessage).toHaveBeenLastCalledWith(
      KILZI_CHAT_ID,
      'Selected Chip: WILDCARD_CHIP'
    );
  });
});
