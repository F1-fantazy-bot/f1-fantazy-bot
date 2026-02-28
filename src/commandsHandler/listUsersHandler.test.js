const { handleListUsersCommand } = require('./listUsersHandler');
const { listAllUsers } = require('../userRegistryService');
const { sendLogMessage, isAdminMessage, formatDateTime } = require('../utils/utils');

// Mock the dependencies
jest.mock('../userRegistryService');
jest.mock('../utils/utils');

describe('listUsersHandler', () => {
  let mockBot;
  let mockMsg;
  const mockChatId = 123456;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    mockMsg = {
      chat: { id: mockChatId },
    };

    sendLogMessage.mockResolvedValue();
    isAdminMessage.mockReturnValue(true);
    formatDateTime.mockReturnValue({
      dateStr: 'Monday, January 1, 2025',
      timeStr: '12:00 IST',
    });
  });

  describe('handleListUsersCommand', () => {
    it('should deny access to non-admin users', async () => {
      isAdminMessage.mockReturnValue(false);

      await handleListUsersCommand(mockBot, mockMsg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        'Sorry, only admins can use this command.',
      );
      expect(listAllUsers).not.toHaveBeenCalled();
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should display message when no users are registered', async () => {
      listAllUsers.mockResolvedValue([]);

      await handleListUsersCommand(mockBot, mockMsg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        'No registered users found.',
      );
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should display all users with their data', async () => {
      const mockUsers = [
        {
          chatId: '111',
          chatName: 'Alice',
          firstSeen: '2025-01-01T10:00:00.000Z',
          lastSeen: '2025-01-15T14:30:00.000Z',
        },
        {
          chatId: '222',
          chatName: 'Bob',
          firstSeen: '2025-01-05T08:00:00.000Z',
          lastSeen: '2025-01-20T16:45:00.000Z',
        },
      ];
      listAllUsers.mockResolvedValue(mockUsers);

      await handleListUsersCommand(mockBot, mockMsg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('*Registered Users* (2)'),
        { parse_mode: 'Markdown' },
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('Alice'),
        { parse_mode: 'Markdown' },
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('Bob'),
        { parse_mode: 'Markdown' },
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('`111`'),
        { parse_mode: 'Markdown' },
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('`222`'),
        { parse_mode: 'Markdown' },
      );
      expect(formatDateTime).toHaveBeenCalledTimes(4); // 2 users × 2 dates each
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('Table storage unavailable');
      listAllUsers.mockRejectedValue(mockError);

      await handleListUsersCommand(mockBot, mockMsg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        '❌ Error fetching user list: Table storage unavailable',
      );
      expect(sendLogMessage).toHaveBeenCalledWith(
        mockBot,
        'Error listing users: Table storage unavailable',
      );
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should handle bot sendMessage errors gracefully', async () => {
      const mockUsers = [
        {
          chatId: '111',
          chatName: 'Alice',
          firstSeen: '2025-01-01T10:00:00.000Z',
          lastSeen: '2025-01-15T14:30:00.000Z',
        },
      ];
      listAllUsers.mockResolvedValue(mockUsers);

      mockBot.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleListUsersCommand(mockBot, mockMsg);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error sending list users message:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });
});
