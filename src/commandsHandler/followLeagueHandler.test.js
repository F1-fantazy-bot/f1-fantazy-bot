const { handleFollowLeagueCommand } = require('./followLeagueHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('../utils/utils', () => ({
  isAdminMessage: jest.fn(),
}));

jest.mock('../pendingReplyManager', () => ({
  registerPendingReply: jest.fn().mockResolvedValue(),
}));

const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

describe('followLeagueHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('rejects non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);

    await handleFollowLeagueCommand(botMock, { chat: { id: 999 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      999,
      'Sorry, only admins can use this command.',
    );
    expect(registerPendingReply).not.toHaveBeenCalled();
  });

  it('registers a pending reply for admins', async () => {
    isAdminMessage.mockReturnValue(true);

    await handleFollowLeagueCommand(botMock, { chat: { id: 1 } });

    expect(registerPendingReply).toHaveBeenCalledWith(1, 'follow_league');
  });

  it('sends a prompt with force_reply', async () => {
    isAdminMessage.mockReturnValue(true);

    await handleFollowLeagueCommand(botMock, { chat: { id: 1 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        'Please enter the league code you want to follow:',
      ),
      { reply_markup: { force_reply: true } },
    );
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(
      'To find your league code',
    );
    expect(botMock.sendMessage.mock.calls[0][1]).toContain('/cancel');
  });
});
