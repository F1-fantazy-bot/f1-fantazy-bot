const { handleRevokeWebUserCommand } = require('./revokeWebUserHandler');

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

describe('revokeWebUserHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('rejects non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);

    await handleRevokeWebUserCommand(botMock, { chat: { id: 999 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      999,
      'Sorry, only admins can use this command.',
    );
    expect(registerPendingReply).not.toHaveBeenCalled();
  });

  it('registers a single-step pending reply for admins and prompts them', async () => {
    isAdminMessage.mockReturnValue(true);

    await handleRevokeWebUserCommand(botMock, { chat: { id: 123 } });

    expect(registerPendingReply).toHaveBeenCalledWith(123, 'revoke_web_user');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining(
        'Please enter the Google email to revoke from the web agent:',
      ),
      { reply_markup: { force_reply: true } },
    );
  });
});
