const { handleReportBugCommand } = require('./reportBugHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key) => key),
}));


jest.mock('../pendingReplyManager', () => ({
  registerPendingReply: jest.fn().mockResolvedValue(),
}));

const { t } = require('../i18n');
const { registerPendingReply } = require('../pendingReplyManager');

describe('reportBugHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  describe('handleReportBugCommand', () => {
    it('should register a pending reply with command ID via pendingReplyManager', async () => {
      const msg = { chat: { id: 123 } };

      await handleReportBugCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(123, 'report_bug');
    });

    it('should send a prompt message with force_reply', async () => {
      const msg = { chat: { id: 123 } };

      await handleReportBugCommand(botMock, msg);

      expect(t).toHaveBeenCalledWith(
        'What message would you like to send to the admins?',
        123,
      );
      expect(t).toHaveBeenCalledWith(
        '💡 Send /cancel at any time to abort.',
        123,
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        'What message would you like to send to the admins?\n\n💡 Send /cancel at any time to abort.',
        { reply_markup: { force_reply: true } },
      );
    });

    it('should handle sendMessage errors gracefully', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      botMock.sendMessage = jest
        .fn()
        .mockRejectedValue(new Error('Send failed'));
      const msg = { chat: { id: 123 } };

      await handleReportBugCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(123, 'report_bug');
      consoleSpy.mockRestore();
    });
  });
});
