const { handleReportBugCommand } = require('./reportBugHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('../utils/utils', () => ({
  getChatName: jest.fn(() => 'Test User'),
  sendMessageToAdmins: jest.fn().mockResolvedValue(),
}));

jest.mock('../pendingReplyManager', () => ({
  registerPendingReply: jest.fn(),
}));

const { t } = require('../i18n');
const { getChatName, sendMessageToAdmins } = require('../utils/utils');
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
    it('should register a pending reply handler via pendingReplyManager', async () => {
      const msg = { chat: { id: 123 } };

      await handleReportBugCommand(botMock, msg);

      expect(registerPendingReply).toHaveBeenCalledWith(
        123,
        expect.any(Function),
        expect.objectContaining({
          validate: expect.any(Function),
          resendPromptIfNotValid: 'We support only text. {PROMPT}',
        }),
      );
    });

    it('should send a prompt message with force_reply', async () => {
      const msg = { chat: { id: 123 } };

      await handleReportBugCommand(botMock, msg);

      expect(t).toHaveBeenCalledWith(
        'What message would you like to send to the admins?',
        123,
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        'What message would you like to send to the admins?',
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

      expect(registerPendingReply).toHaveBeenCalledWith(
        123,
        expect.any(Function),
        expect.objectContaining({
          validate: expect.any(Function),
          resendPromptIfNotValid: expect.any(String),
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('registered reply handler', () => {
    it('should send the bug report to admins when reply is received', async () => {
      const msg = { chat: { id: 456 } };
      await handleReportBugCommand(botMock, msg);

      // Extract the registered handler
      const replyHandler = registerPendingReply.mock.calls[0][1];

      const replyMsg = {
        chat: { id: 456, first_name: 'Test' },
        text: 'Something is broken',
      };

      await replyHandler(botMock, replyMsg);

      expect(getChatName).toHaveBeenCalledWith(replyMsg);
      expect(t).toHaveBeenCalledWith(
        'Bug report from {NAME} ({ID}):\n\n{MESSAGE}',
        456,
        {
          NAME: 'Test User',
          ID: 456,
          MESSAGE: 'Something is broken',
        },
      );
      expect(sendMessageToAdmins).toHaveBeenCalledWith(
        botMock,
        'Bug report from {NAME} ({ID}):\n\n{MESSAGE}',
      );
    });

    it('should send a confirmation to the user', async () => {
      const msg = { chat: { id: 456 } };
      await handleReportBugCommand(botMock, msg);

      const replyHandler = registerPendingReply.mock.calls[0][1];

      const replyMsg = {
        chat: { id: 456, first_name: 'Test' },
        text: 'Something is broken',
      };

      await replyHandler(botMock, replyMsg);

      expect(t).toHaveBeenCalledWith(
        'Your message has been sent to the admins. Thank you!',
        456,
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        456,
        'Your message has been sent to the admins. Thank you!',
      );
    });

    it('should handle confirmation sendMessage errors gracefully', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const msg = { chat: { id: 456 } };
      await handleReportBugCommand(botMock, msg);

      const replyHandler = registerPendingReply.mock.calls[0][1];

      // Reset botMock to fail on the reply handler's sendMessage
      botMock.sendMessage = jest
        .fn()
        .mockRejectedValue(new Error('Send failed'));

      const replyMsg = {
        chat: { id: 456, first_name: 'Test' },
        text: 'Something is broken',
      };

      await replyHandler(botMock, replyMsg);

      expect(sendMessageToAdmins).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('validate option', () => {
    it('should accept text messages', async () => {
      const msg = { chat: { id: 789 } };
      await handleReportBugCommand(botMock, msg);

      const options = registerPendingReply.mock.calls[0][2];

      expect(options.validate({ text: 'hello' })).toBe(true);
    });

    it('should reject non-text messages', async () => {
      const msg = { chat: { id: 789 } };
      await handleReportBugCommand(botMock, msg);

      const options = registerPendingReply.mock.calls[0][2];

      expect(options.validate({ photo: [{ file_id: 'abc' }] })).toBe(false);
    });
  });
});
