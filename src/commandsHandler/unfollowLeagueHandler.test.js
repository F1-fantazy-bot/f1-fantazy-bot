const {
  handleUnfollowLeagueCommand,
} = require('./unfollowLeagueHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key, _chatId, vars) =>
    vars
      ? Object.entries(vars).reduce(
          (acc, [k, v]) => acc.replace(`{${k}}`, v),
          key,
        )
      : key,
  ),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

const { listUserLeagues } = require('../leagueRegistryService');

describe('unfollowLeagueHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('tells the user when no leagues are followed', async () => {
    listUserLeagues.mockResolvedValueOnce([]);

    await handleUnfollowLeagueCommand(botMock, {
      chat: { id: 1 },
      message_id: 10,
    });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      'You are not following any league. Run /follow_league to follow one first.',
    );
  });

  it('shows an inline keyboard with league name labels', async () => {
    listUserLeagues.mockResolvedValueOnce([
      { leagueCode: 'ABC', leagueName: 'Amba' },
      { leagueCode: 'XYZ', leagueName: 'Other' },
    ]);

    await handleUnfollowLeagueCommand(botMock, {
      chat: { id: 1 },
      message_id: 10,
    });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      'Which league do you want to unfollow?',
      expect.objectContaining({
        reply_to_message_id: 10,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Amba', callback_data: 'LEAGUE_UNFOLLOW:ABC' }],
            [{ text: 'Other', callback_data: 'LEAGUE_UNFOLLOW:XYZ' }],
          ],
        },
      }),
    );
  });

  it('surfaces service errors', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    listUserLeagues.mockRejectedValueOnce(new Error('boom'));

    await handleUnfollowLeagueCommand(botMock, { chat: { id: 1 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      '❌ Failed to load your leagues: boom',
    );
    consoleSpy.mockRestore();
  });
});
