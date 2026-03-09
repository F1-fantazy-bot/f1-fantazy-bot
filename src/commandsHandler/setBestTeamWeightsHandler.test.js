const { KILZI_CHAT_ID } = require('../constants');
const { userCache } = require('../cache');

jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));

const { updateUserAttributes } = require('../userRegistryService');
const { handleSetBestTeamWeights } = require('./setBestTeamWeightsHandler');

describe('handleSetBestTeamWeights', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(userCache).forEach((key) => delete userCache[key]);
  });

  it('should normalize and persist weights', async () => {
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/set_best_team_weights 80 20' };

    await handleSetBestTeamWeights(botMock, msg);

    expect(updateUserAttributes).toHaveBeenCalledWith(KILZI_CHAT_ID, {
      bestTeamPointsWeight: 0.8,
      bestTeamPriceChangeWeight: 0.2,
    });
    expect(userCache[String(KILZI_CHAT_ID)]).toEqual(
      expect.objectContaining({
        bestTeamPointsWeight: 0.8,
        bestTeamPriceChangeWeight: 0.2,
      }),
    );
  });

  it('should reject invalid numbers', async () => {
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/set_best_team_weights a 20' };

    await handleSetBestTeamWeights(botMock, msg);

    expect(updateUserAttributes).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Weights must be non-negative numbers.',
    );
  });
});
