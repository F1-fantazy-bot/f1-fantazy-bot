const {
  KILZI_CHAT_ID,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
} = require('../constants');
const { remainingRaceCountCache, sharedKey } = require('../cache');

jest.mock('../cache', () => ({
  resolveSelectedTeam: jest.fn().mockResolvedValue('T1'),
  remainingRaceCountCache: {},
  sharedKey: 'defaultSharedKey',
  userCache: {},
}));

const { resolveSelectedTeam } = require('../cache');
const {
  handleSetBestTeamRanking,
  BEST_TEAM_RANKING_PRESETS,
} = require('./setBestTeamRankingHandler');

describe('handleSetBestTeamRanking', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
    delete remainingRaceCountCache[sharedKey];
  });

  it('should send inline keyboard with 4 preset options', async () => {
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/set_best_team_ranking' };
    remainingRaceCountCache[sharedKey] = 22;

    await handleSetBestTeamRanking(botMock, msg);

    expect(resolveSelectedTeam).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Choose best-team ranking preference:\nValue = points added for each 1M budget change per race left.\nRemaining races used now: 21.',
      {
        reply_markup: {
          inline_keyboard: expect.any(Array),
        },
      },
    );

    const sentKeyboard = botMock.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard;
    expect(sentKeyboard).toHaveLength(4);

    BEST_TEAM_RANKING_PRESETS.forEach((preset, index) => {
      expect(sentKeyboard[index][0].callback_data).toBe(
        `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T1:${preset.id}`,
      );
    });

    expect(sentKeyboard[0][0].text).toBe(
      '🎯 Pure Points (0)',
    );
  });

  it('should show unavailable when remaining race count is missing', async () => {
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/set_best_team_ranking' };

    await handleSetBestTeamRanking(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Choose best-team ranking preference:\nValue = points added for each 1M budget change per race left.\nRemaining races used now: unavailable.',
      {
        reply_markup: {
          inline_keyboard: expect.any(Array),
        },
      },
    );
  });
});
