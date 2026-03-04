jest.mock('./i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('./utils/utils', () => ({
  getChatName: jest.fn(() => 'Test User'),
  sendMessageToAdmins: jest.fn().mockResolvedValue(),
}));

jest.mock('./constants', () => ({
  REPORTED_BUGS_GROUP_ID: -5161566735,
  KILZI_CHAT_ID: 454873194,
  DORSE_CHAT_ID: 673447790,
}));

jest.mock('./userRegistryService', () => ({
  getUserById: jest.fn(),
  listAllUsers: jest.fn(),
}));

jest.mock('./pendingReplyManager', () => ({
  registerPendingReply: jest.fn().mockResolvedValue(),
}));

const {
  PENDING_REPLY_REGISTRY,
  resolveCommand,
} = require('./pendingReplyRegistry');
const { t } = require('./i18n');
const { getChatName, sendMessageToAdmins } = require('./utils/utils');
const { getUserById, listAllUsers } = require('./userRegistryService');
const { registerPendingReply } = require('./pendingReplyManager');
const { KILZI_CHAT_ID, DORSE_CHAT_ID } = require('./constants');

describe('pendingReplyRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveCommand', () => {
    it('should return null for unknown command IDs', () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = resolveCommand('unknown_command', 123);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Unknown pending reply command: unknown_command',
      );
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

      it('should send the bug report to the dedicated bugs group', async () => {
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 456, first_name: 'Test' },
          text: 'Something is broken',
        };

        const resolved = resolveCommand('report_bug', 456);
        await resolved.handler(botMock, replyMsg);

        expect(botMock.sendMessage).toHaveBeenCalledWith(
          -5161566735,
          'Bug report from {NAME} ({ID}):\n\n{MESSAGE}',
        );
      });

      it('should handle bugs group sendMessage errors gracefully', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const botMock = {
          sendMessage: jest
            .fn()
            .mockRejectedValueOnce(new Error('Bugs group send failed'))
            .mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 456, first_name: 'Test' },
          text: 'Something is broken',
        };

        const resolved = resolveCommand('report_bug', 456);
        await resolved.handler(botMock, replyMsg);

        expect(sendMessageToAdmins).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
          'Error sending bug report to bugs group:',
          expect.any(Error),
        );
        // Confirmation should still be sent after bugs group error
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          456,
          'Your message has been sent to the admins. Thank you!',
        );
        consoleSpy.mockRestore();
      });

      it('should handle confirmation sendMessage errors gracefully', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
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
        expect(t).toHaveBeenCalledWith('We support only text. {PROMPT}', 789, {
          PROMPT: 'What message would you like to send to the admins?',
        });
        expect(resolved.resendPromptIfNotValid).toBe(
          'We support only text. {PROMPT}',
        );
      });
    });
  });

  describe('PENDING_REPLY_REGISTRY', () => {
    it('should have report_bug registered', () => {
      expect(PENDING_REPLY_REGISTRY.report_bug).toBeDefined();
      expect(typeof PENDING_REPLY_REGISTRY.report_bug.buildHandler).toBe(
        'function',
      );
      expect(typeof PENDING_REPLY_REGISTRY.report_bug.buildValidate).toBe(
        'function',
      );
      expect(typeof PENDING_REPLY_REGISTRY.report_bug.buildResendPrompt).toBe(
        'function',
      );
    });

    it('should have broadcast registered', () => {
      expect(PENDING_REPLY_REGISTRY.broadcast).toBeDefined();
      expect(typeof PENDING_REPLY_REGISTRY.broadcast.buildHandler).toBe(
        'function',
      );
      expect(typeof PENDING_REPLY_REGISTRY.broadcast.buildValidate).toBe(
        'function',
      );
      expect(typeof PENDING_REPLY_REGISTRY.broadcast.buildResendPrompt).toBe(
        'function',
      );
    });

    it('should have send_message_to_user registered', () => {
      expect(PENDING_REPLY_REGISTRY.send_message_to_user).toBeDefined();
      expect(
        typeof PENDING_REPLY_REGISTRY.send_message_to_user.buildHandler,
      ).toBe('function');
      expect(
        typeof PENDING_REPLY_REGISTRY.send_message_to_user.buildValidate,
      ).toBe('function');
      expect(
        typeof PENDING_REPLY_REGISTRY.send_message_to_user.buildResendPrompt,
      ).toBe('function');
    });
  });

  describe('send_message_to_user entry', () => {
    describe('buildHandler - step 1 (collect_user_id)', () => {
      it('should register step 2 and ask for message when user ID is valid', async () => {
        getUserById.mockResolvedValue({
          chatId: '456',
          chatName: 'Target User',
        });
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 100, first_name: 'Admin' },
          text: '456',
        };

        const resolved = resolveCommand('send_message_to_user', 100, {
          step: 'collect_user_id',
        });
        await resolved.handler(botMock, replyMsg);

        expect(registerPendingReply).toHaveBeenCalledWith(
          100,
          'send_message_to_user',
          { step: 'collect_message', targetChatId: '456' },
        );
        expect(t).toHaveBeenCalledWith(
          'What message do you want to send to {NAME}?',
          100,
          { NAME: 'Target User' },
        );
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          100,
          'What message do you want to send to {NAME}?',
          { reply_markup: { force_reply: true } },
        );
      });

      it('should handle getUserById errors gracefully', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        getUserById.mockRejectedValue(new Error('Storage error'));
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 100, first_name: 'Admin' },
          text: '456',
        };

        const resolved = resolveCommand('send_message_to_user', 100, {
          step: 'collect_user_id',
        });
        await resolved.handler(botMock, replyMsg);

        expect(botMock.sendMessage).toHaveBeenCalledWith(
          100,
          '❌ Error fetching user list: {ERROR}',
        );
        expect(registerPendingReply).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      it('should treat null data as collect_user_id step', async () => {
        getUserById.mockResolvedValue({
          chatId: '456',
          chatName: 'Target User',
        });
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 100, first_name: 'Admin' },
          text: '456',
        };

        const resolved = resolveCommand('send_message_to_user', 100, null);
        await resolved.handler(botMock, replyMsg);

        expect(registerPendingReply).toHaveBeenCalledWith(
          100,
          'send_message_to_user',
          { step: 'collect_message', targetChatId: '456' },
        );
      });
    });

    describe('buildHandler - step 2 (collect_message)', () => {
      it('should send the prefixed message to the target user and confirm to admin', async () => {
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 100, first_name: 'Admin' },
          text: 'Hello from admin!',
        };

        const resolved = resolveCommand('send_message_to_user', 100, {
          step: 'collect_message',
          targetChatId: '456',
        });
        await resolved.handler(botMock, replyMsg);

        // Admin notice is localized to the TARGET user's language
        expect(t).toHaveBeenCalledWith(
          '📩 Message from bot admin:\n\n{MESSAGE}',
          456,
          { MESSAGE: 'Hello from admin!' },
        );
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          456,
          '📩 Message from bot admin:\n\n{MESSAGE}',
        );
        expect(t).toHaveBeenCalledWith(
          'Message sent successfully to user {ID}.',
          100,
          { ID: '456' },
        );
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          100,
          'Message sent successfully to user {ID}.',
        );
      });

      it('should handle send message errors gracefully', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const botMock = {
          sendMessage: jest
            .fn()
            .mockRejectedValueOnce(new Error('User blocked bot'))
            .mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 100, first_name: 'Admin' },
          text: 'Hello from admin!',
        };

        const resolved = resolveCommand('send_message_to_user', 100, {
          step: 'collect_message',
          targetChatId: '456',
        });
        await resolved.handler(botMock, replyMsg);

        expect(consoleSpy).toHaveBeenCalledWith(
          'Error sending message to target user:',
          expect.any(Error),
        );
        expect(t).toHaveBeenCalledWith(
          'Failed to send message to user {ID}: {ERROR}',
          100,
          { ID: '456', ERROR: 'User blocked bot' },
        );
        consoleSpy.mockRestore();
      });
    });

    describe('buildValidate', () => {
      it('should accept text with existing user for collect_user_id step', async () => {
        getUserById.mockResolvedValue({
          chatId: '456',
          chatName: 'Target User',
        });
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_user_id',
        });

        const result = await resolved.validate({ text: '456' });

        expect(result).toBe(true);
        expect(getUserById).toHaveBeenCalledWith('456');
      });

      it('should reject text with non-existing user for collect_user_id step', async () => {
        getUserById.mockResolvedValue(null);
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_user_id',
        });

        const result = await resolved.validate({ text: '999' });

        expect(result).toBe(false);
        expect(getUserById).toHaveBeenCalledWith('999');
      });

      it('should reject non-text messages for collect_user_id step', async () => {
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_user_id',
        });

        const result = await resolved.validate({ photo: [{ file_id: 'abc' }] });

        expect(result).toBe(false);
        // Should not call getUserById if no text
        expect(getUserById).not.toHaveBeenCalled();
      });

      it('should return false when getUserById throws for collect_user_id step', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        getUserById.mockRejectedValue(new Error('Storage error'));
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_user_id',
        });

        const result = await resolved.validate({ text: '456' });

        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(
          'Error validating user ID:',
          expect.any(Error),
        );
        consoleSpy.mockRestore();
      });

      it('should accept text messages for collect_message step', () => {
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_message',
          targetChatId: '456',
        });

        expect(resolved.validate({ text: 'hello' })).toBe(true);
      });

      it('should reject non-text messages for collect_message step', () => {
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_message',
          targetChatId: '456',
        });

        expect(resolved.validate({ photo: [{ file_id: 'abc' }] })).toBe(false);
      });
    });

    describe('buildResendPrompt', () => {
      it('should return user not found prompt for collect_user_id step', () => {
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_user_id',
        });

        expect(resolved.resendPromptIfNotValid).toBe(
          'User not found. Please enter a valid chat ID:',
        );
      });

      it('should return message prompt for collect_message step', () => {
        const resolved = resolveCommand('send_message_to_user', 123, {
          step: 'collect_message',
          targetChatId: '456',
        });

        expect(resolved.resendPromptIfNotValid).toBe(
          'We support only text. Please enter the message to send.',
        );
      });

      it('should default to user not found prompt when data is null', () => {
        const resolved = resolveCommand('send_message_to_user', 123, null);

        expect(resolved.resendPromptIfNotValid).toBe(
          'User not found. Please enter a valid chat ID:',
        );
      });
    });
  });

  describe('broadcast entry', () => {
    describe('buildHandler', () => {
      it('should send the message to all registered users and report summary', async () => {
        listAllUsers.mockResolvedValue([
          { chatId: String(KILZI_CHAT_ID), chatName: 'User A' },
          { chatId: String(DORSE_CHAT_ID), chatName: 'User B' },
        ]);
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 999, first_name: 'Admin' },
          text: 'Important announcement!',
        };

        const resolved = resolveCommand('broadcast', 999);
        await resolved.handler(botMock, replyMsg);

        // Should send broadcast to each user
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          KILZI_CHAT_ID,
          '📢 Broadcast from bot admin:\n\n{MESSAGE}',
        );
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          DORSE_CHAT_ID,
          '📢 Broadcast from bot admin:\n\n{MESSAGE}',
        );

        // Should send summary to admin
        expect(t).toHaveBeenCalledWith(
          'Broadcast complete.\n\n✅ Sent successfully: {SUCCESS}\n❌ Failed: {FAILED}',
          999,
          { SUCCESS: '2', FAILED: '0' },
        );
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          999,
          'Broadcast complete.\n\n✅ Sent successfully: {SUCCESS}\n❌ Failed: {FAILED}',
        );
      });

      it('should handle partial failures and include details in summary', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        listAllUsers.mockResolvedValue([
          { chatId: String(KILZI_CHAT_ID), chatName: 'User A' },
          { chatId: String(DORSE_CHAT_ID), chatName: 'User B' },
        ]);
        const botMock = {
          sendMessage: jest
            .fn()
            .mockResolvedValueOnce() // User A success
            .mockRejectedValueOnce(new Error('User blocked bot')) // User B fails
            .mockResolvedValue(), // summary message
        };
        const replyMsg = {
          chat: { id: 999, first_name: 'Admin' },
          text: 'Important announcement!',
        };

        const resolved = resolveCommand('broadcast', 999);
        await resolved.handler(botMock, replyMsg);

        expect(t).toHaveBeenCalledWith(
          'Broadcast complete.\n\n✅ Sent successfully: {SUCCESS}\n❌ Failed: {FAILED}',
          999,
          { SUCCESS: '1', FAILED: '1' },
        );
        expect(t).toHaveBeenCalledWith('Failed to send to:\n{DETAILS}', 999, {
          DETAILS: `User B (${DORSE_CHAT_ID})`,
        });
        consoleSpy.mockRestore();
      });

      it('should handle empty user list', async () => {
        listAllUsers.mockResolvedValue([]);
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 999, first_name: 'Admin' },
          text: 'Important announcement!',
        };

        const resolved = resolveCommand('broadcast', 999);
        await resolved.handler(botMock, replyMsg);

        expect(t).toHaveBeenCalledWith(
          'No registered users found to broadcast to.',
          999,
        );
        expect(botMock.sendMessage).toHaveBeenCalledWith(
          999,
          'No registered users found to broadcast to.',
        );
      });

      it('should handle listAllUsers errors gracefully', async () => {
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        listAllUsers.mockRejectedValue(new Error('Storage error'));
        const botMock = {
          sendMessage: jest.fn().mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 999, first_name: 'Admin' },
          text: 'Important announcement!',
        };

        const resolved = resolveCommand('broadcast', 999);
        await resolved.handler(botMock, replyMsg);

        expect(t).toHaveBeenCalledWith(
          '❌ Error fetching user list: {ERROR}',
          999,
          { ERROR: 'Storage error' },
        );
        consoleSpy.mockRestore();
      });

      it('should handle users with missing chatName', async () => {
        listAllUsers.mockResolvedValue([{ chatId: String(KILZI_CHAT_ID) }]);
        const botMock = {
          sendMessage: jest
            .fn()
            .mockRejectedValueOnce(new Error('Failed'))
            .mockResolvedValue(),
        };
        const replyMsg = {
          chat: { id: 999, first_name: 'Admin' },
          text: 'test',
        };

        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const resolved = resolveCommand('broadcast', 999);
        await resolved.handler(botMock, replyMsg);

        expect(t).toHaveBeenCalledWith('Failed to send to:\n{DETAILS}', 999, {
          DETAILS: `Unknown (${KILZI_CHAT_ID})`,
        });
        consoleSpy.mockRestore();
      });
    });

    describe('buildValidate', () => {
      it('should accept text messages', () => {
        const resolved = resolveCommand('broadcast', 123);

        expect(resolved.validate({ text: 'hello' })).toBe(true);
      });

      it('should reject non-text messages', () => {
        const resolved = resolveCommand('broadcast', 123);

        expect(resolved.validate({ photo: [{ file_id: 'abc' }] })).toBe(false);
      });
    });

    describe('buildResendPrompt', () => {
      it('should build the resend prompt using translations', () => {
        const resolved = resolveCommand('broadcast', 789);

        expect(t).toHaveBeenCalledWith(
          'We support only text. Please enter the message to broadcast.',
          789,
        );
        expect(resolved.resendPromptIfNotValid).toBe(
          'We support only text. Please enter the message to broadcast.',
        );
      });
    });
  });
});
