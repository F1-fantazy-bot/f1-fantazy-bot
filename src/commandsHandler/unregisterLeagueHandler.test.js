const {
  handleUnregisterLeagueCommand,
} = require('./unregisterLeagueHandler');

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

jest.mock('../utils/utils', () => ({
  isAdminMessage: jest.fn(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');

describe('unregisterLeagueHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('rejects non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);

    await handleUnregisterLeagueCommand(botMock, { chat: { id: 999 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      999,
      'Sorry, only admins can use this command.',
    );
    expect(listUserLeagues).not.toHaveBeenCalled();
  });

  it('tells the admin when no leagues are registered', async () => {
    isAdminMessage.mockReturnValue(true);
    listUserLeagues.mockResolvedValueOnce([]);

    await handleUnregisterLeagueCommand(botMock, {
      chat: { id: 1 },
      message_id: 10,
    });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      'You are not registered to any league. Run /register_league to register to one first.',
    );
  });

  it('shows an inline keyboard with league name labels', async () => {
    isAdminMessage.mockReturnValue(true);
    listUserLeagues.mockResolvedValueOnce([
      { leagueCode: 'ABC', leagueName: 'Amba' },
      { leagueCode: 'XYZ', leagueName: 'Other' },
    ]);

    await handleUnregisterLeagueCommand(botMock, {
      chat: { id: 1 },
      message_id: 10,
    });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      'Which league do you want to unregister from?',
      expect.objectContaining({
        reply_to_message_id: 10,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Amba', callback_data: 'LEAGUE_UNREGISTER:ABC' }],
            [{ text: 'Other', callback_data: 'LEAGUE_UNREGISTER:XYZ' }],
          ],
        },
      }),
    );
  });

  it('surfaces service errors', async () => {
    isAdminMessage.mockReturnValue(true);
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    listUserLeagues.mockRejectedValueOnce(new Error('boom'));

    await handleUnregisterLeagueCommand(botMock, { chat: { id: 1 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      '❌ Failed to load your leagues: boom',
    );
    consoleSpy.mockRestore();
  });
});
