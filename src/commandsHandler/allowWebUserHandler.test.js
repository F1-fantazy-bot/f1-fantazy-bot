const { handleAllowWebUserCommand } = require('./allowWebUserHandler');

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

describe('allowWebUserHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('rejects non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);

    await handleAllowWebUserCommand(botMock, { chat: { id: 999 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      999,
      'Sorry, only admins can use this command.',
    );
    expect(registerPendingReply).not.toHaveBeenCalled();
  });

  it('registers a pending reply with step=collect_email and prompts the admin', async () => {
    isAdminMessage.mockReturnValue(true);

    await handleAllowWebUserCommand(botMock, { chat: { id: 123 } });

    expect(registerPendingReply).toHaveBeenCalledWith(
      123,
      'allow_web_user',
      { step: 'collect_email' },
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining(
        'Please enter the Google email to allow on the web agent:',
      ),
      { reply_markup: { force_reply: true } },
    );
  });
});
