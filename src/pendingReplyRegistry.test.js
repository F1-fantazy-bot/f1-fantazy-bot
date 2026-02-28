jest.mock('./i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('./utils/utils', () => ({
  getChatName: jest.fn(() => 'Test User'),
  sendMessageToAdmins: jest.fn().mockResolvedValue(),
}));

const { PENDING_REPLY_REGISTRY, resolveCommand } = require('./pendingReplyRegistry');
const { t } = require('./i18n');
const { getChatName, sendMessageToAdmins } = require('./utils/utils');

describe('pendingReplyRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveCommand', () => {
    it('should return null for unknown command IDs', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = resolveCommand('unknown_command', 123);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Unknown pending reply command: unknown_command');
      consoleSpy.mockRestore();
    });

    it('should return handler, validate, and resendPromptIfNotValid for known commands', () => {
      const result = resolveCommand('report_bug', 123);

      expect(result).toBeDefined();
      expect(typeof result.handler).toBe('function');
      expect(typeof result.validate).toBe('function');
      expect(typeof result.resendPromptIfNotValid).toBe('string');
    });
  });

  describe('report_bug entry', () => {
    describe('buildHandler', () => {
      it('should send the bug report to admins and confirm to user', async () => {
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 456, first_name: 'Test' },
          text: 'Something is broken',
        };

        const resolved = resolveCommand('report_bug', 456);
        await resolved.handler(botMock, replyMsg);

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
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const botMock = {
          sendMessage: jest.fn().mockRejectedValue(new Error('Send failed')),
        };
        const replyMsg = {
          chat: { id: 456, first_name: 'Test' },
          text: 'Something is broken',
        };

        const resolved = resolveCommand('report_bug', 456);
        await resolved.handler(botMock, replyMsg);

        expect(sendMessageToAdmins).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('buildValidate', () => {
      it('should accept text messages', () => {
        const resolved = resolveCommand('report_bug', 123);

        expect(resolved.validate({ text: 'hello' })).toBe(true);
      });

      it('should reject non-text messages', () => {
        const resolved = resolveCommand('report_bug', 123);

        expect(resolved.validate({ photo: [{ file_id: 'abc' }] })).toBe(false);
      });
    });

    describe('buildResendPrompt', () => {
      it('should build the resend prompt using translations', () => {
        const resolved = resolveCommand('report_bug', 789);

        expect(t).toHaveBeenCalledWith(
          'What message would you like to send to the admins?',
          789,
        );
        expect(t).toHaveBeenCalledWith(
          'We support only text. {PROMPT}',
          789,
          { PROMPT: 'What message would you like to send to the admins?' },
        );
        expect(resolved.resendPromptIfNotValid).toBe('We support only text. {PROMPT}');
      });
    });
  });

  describe('PENDING_REPLY_REGISTRY', () => {
    it('should have report_bug registered', () => {
      expect(PENDING_REPLY_REGISTRY.report_bug).toBeDefined();
      expect(typeof PENDING_REPLY_REGISTRY.report_bug.buildHandler).toBe('function');
      expect(typeof PENDING_REPLY_REGISTRY.report_bug.buildValidate).toBe('function');
      expect(typeof PENDING_REPLY_REGISTRY.report_bug.buildResendPrompt).toBe('function');
    });
  });
});
