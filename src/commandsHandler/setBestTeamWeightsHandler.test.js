const {
  KILZI_CHAT_ID,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
} = require('../constants');

jest.mock('../cache', () => ({
  resolveSelectedTeam: jest.fn().mockResolvedValue('T1'),
  userCache: {},
}));

const { resolveSelectedTeam } = require('../cache');
const { handleSetBestTeamWeights, BEST_TEAM_WEIGHT_PRESETS } = require('./setBestTeamWeightsHandler');

describe('handleSetBestTeamWeights', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send inline keyboard with 4 preset options', async () => {
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/set_best_team_weights' };

    await handleSetBestTeamWeights(botMock, msg);

    expect(resolveSelectedTeam).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Choose best-team ranking preference:',
      {
        reply_markup: {
          inline_keyboard: expect.any(Array),
        },
      },
    );

    const sentKeyboard = botMock.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard;
    expect(sentKeyboard).toHaveLength(4);

    BEST_TEAM_WEIGHT_PRESETS.forEach((preset, index) => {
      expect(sentKeyboard[index][0].callback_data).toBe(
        `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T1:${preset.id}`,
      );
    });
  });
});
