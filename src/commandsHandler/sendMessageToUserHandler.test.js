const { handleSendMessageToUserCommand } = require('./sendMessageToUserHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('../utils/utils', () => ({
  isAdminMessage: jest.fn(),
}));

jest.mock('../pendingReplyManager', () => ({
  registerPendingReply: jest.fn().mockResolvedValue(),
}));

const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

describe('sendMessageToUserHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  describe('handleSendMessageToUserCommand', () => {
    it('should reject non-admin users', async () => {
      isAdminMessage.mockReturnValue(false);
      const msg = { chat: { id: 999 } };

      await handleSendMessageToUserCommand(botMock, msg);

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        999,
        'Sorry, only admins can use this command.',
      );
      expect(registerPendingReply).not.toHaveBeenCalled();
    });

    it('should register a pending reply with command ID and step data for admin users', async () => {
      isAdminMessage.mockReturnValue(true);
      const msg = { chat: { id: 123 } };

      await handleSendMessageToUserCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(
        123,
        'send_message_to_user',
        { step: 'collect_user_id' },
      );
    });

    it('should send a prompt message with force_reply', async () => {
      isAdminMessage.mockReturnValue(true);
      const msg = { chat: { id: 123 } };

      await handleSendMessageToUserCommand(botMock, msg);

      expect(t).toHaveBeenCalledWith(
        'Please enter the chat ID of the user you want to send a message or image to:',
        123,
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        'Please enter the chat ID of the user you want to send a message or image to:',
        { reply_markup: { force_reply: true } },
      );
    });

    it('should handle sendMessage errors gracefully', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      isAdminMessage.mockReturnValue(true);
      botMock.sendMessage = jest
        .fn()
        .mockRejectedValue(new Error('Send failed'));
      const msg = { chat: { id: 123 } };

      await handleSendMessageToUserCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(
        123,
        'send_message_to_user',
        { step: 'collect_user_id' },
      );
      consoleSpy.mockRestore();
    });
  });
});
