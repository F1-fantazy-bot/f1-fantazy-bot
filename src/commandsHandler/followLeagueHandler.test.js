const { handleFollowLeagueCommand } = require('./followLeagueHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('../pendingReplyManager', () => ({
  registerPendingReply: jest.fn().mockResolvedValue(),
}));

const { registerPendingReply } = require('../pendingReplyManager');

describe('followLeagueHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('registers a pending reply for the user', async () => {
    await handleFollowLeagueCommand(botMock, { chat: { id: 1 } });

    expect(registerPendingReply).toHaveBeenCalledWith(1, 'follow_league');
  });

  it('sends a prompt with force_reply', async () => {
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
