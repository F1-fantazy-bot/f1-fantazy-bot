const { handleBroadcastCommand } = require('./broadcastHandler');

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

describe('broadcastHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  describe('handleBroadcastCommand', () => {
    it('should reject non-admin users', async () => {
      isAdminMessage.mockReturnValue(false);
      const msg = { chat: { id: 999 } };

      await handleBroadcastCommand(botMock, msg);

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        999,
        'Sorry, only admins can use this command.',
      );
      expect(registerPendingReply).not.toHaveBeenCalled();
    });

    it('should register a pending reply with command ID for admin users', async () => {
      isAdminMessage.mockReturnValue(true);
      const msg = { chat: { id: 123 } };

      await handleBroadcastCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(123, 'broadcast');
    });

    it('should send a prompt message with force_reply', async () => {
      isAdminMessage.mockReturnValue(true);
      const msg = { chat: { id: 123 } };

      await handleBroadcastCommand(botMock, msg);

      expect(t).toHaveBeenCalledWith(
        'Please enter the message or image you want to broadcast to all users:',
        123,
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        'Please enter the message or image you want to broadcast to all users:',
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

      await handleBroadcastCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(123, 'broadcast');
      consoleSpy.mockRestore();
    });
  });
});
