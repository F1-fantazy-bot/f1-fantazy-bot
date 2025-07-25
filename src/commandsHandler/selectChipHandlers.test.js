const { KILZI_CHAT_ID, EXTRA_DRS_CHIP, WILDCARD_CHIP, WITHOUT_CHIP } = require('../constants');
const { bestTeamsCache, selectedChipCache } = require('../cache');
const { handleSelectExtraDrs, handleResetChip } = require('./selectChipHandlers');

describe('select chip handlers', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
  });

  it('should select EXTRA_DRS chip and clear bestTeamsCache', async () => {
    bestTeamsCache[KILZI_CHAT_ID] = { some: 'data' };

    await handleSelectExtraDrs(botMock, { chat: { id: KILZI_CHAT_ID } });

    expect(selectedChipCache[KILZI_CHAT_ID]).toBe(EXTRA_DRS_CHIP);
    expect(bestTeamsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining(`Selected chip: ${EXTRA_DRS_CHIP}.`)
    );
  });

  it('should reset chip selection', async () => {
    selectedChipCache[KILZI_CHAT_ID] = WILDCARD_CHIP;

    await handleResetChip(botMock, { chat: { id: KILZI_CHAT_ID } });

    expect(selectedChipCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining(`Selected chip: ${WITHOUT_CHIP}.`)
    );
  });
});
