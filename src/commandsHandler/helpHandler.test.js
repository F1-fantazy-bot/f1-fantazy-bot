const {
  KILZI_CHAT_ID,
  USER_COMMANDS_CONFIG,
  ADMIN_COMMANDS_CONFIG,
  COMMAND_BEST_TEAMS,
} = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(false);

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
}));

const { displayHelpMessage } = require('./helpHandler');

describe('displayHelpMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReset();
    mockIsAdminMessage.mockReturnValue(false);
  });

  it('should handle /help command and send help message for regular user', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/help',
    };

    await displayHelpMessage(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    expect(sentMessage).toContain('*Available Commands:*');
    expect(sentMessage).toContain('*Other Messages:*');
    expect(sentMessage).toContain(
      'Send an image (drivers, constructors, or current team screenshot)'
    );
    expect(sentMessage).toContain(
      'Send valid JSON data to update your drivers, constructors, and current team cache'
    );
    expect(sentMessage).toContain(
      `Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using ${COMMAND_BEST_TEAMS.replace(
        /_/g,
        '\\_'
      )})`
    );

    // Should include user commands
    USER_COMMANDS_CONFIG.forEach((cmd) => {
      const escapedCommand = cmd.constant.replace(/_/g, '\\_');
      expect(sentMessage).toContain(`${escapedCommand} - ${cmd.description}`);
    });

    // Should NOT include admin commands for regular users
    expect(sentMessage).not.toContain('*Admin Commands:*');

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      sentMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should include admin commands when user is admin', async () => {
    mockIsAdminMessage.mockReturnValue(true);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/help',
    };

    await displayHelpMessage(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    expect(sentMessage).toContain('*Available Commands:*');
    expect(sentMessage).toContain('*Admin Commands:*');
    expect(sentMessage).toContain('*Other Messages:*');

    // Should include user commands
    USER_COMMANDS_CONFIG.forEach((cmd) => {
      const escapedCommand = cmd.constant.replace(/_/g, '\\_');
      expect(sentMessage).toContain(`${escapedCommand} - ${cmd.description}`);
    });

    // Should include admin commands
    ADMIN_COMMANDS_CONFIG.forEach((cmd) => {
      const escapedCommand = cmd.constant.replace(/_/g, '\\_');
      expect(sentMessage).toContain(`${escapedCommand} - ${cmd.description}`);
    });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      sentMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should handle sendMessage errors gracefully', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/help',
    };

    botMock.sendMessage.mockRejectedValue(new Error('Network error'));

    await displayHelpMessage(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should properly escape underscores in command names', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/help',
    };

    await displayHelpMessage(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    // Check that commands with underscores are properly escaped for Markdown
    const commandsWithUnderscores = USER_COMMANDS_CONFIG.filter((cmd) =>
      cmd.constant.includes('_')
    );

    commandsWithUnderscores.forEach((cmd) => {
      const escapedCommand = cmd.constant.replace(/_/g, '\\_');
      expect(sentMessage).toContain(escapedCommand);
      // Make sure the original command with unescaped underscores is not present
      expect(sentMessage).not.toContain(`${cmd.constant} - ${cmd.description}`);
    });
  });

  it('should include proper formatting and structure', async () => {
    mockIsAdminMessage.mockReturnValue(true);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/help',
    };

    await displayHelpMessage(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    // Check message structure
    const sections = sentMessage.split('\n\n');
    expect(sections.length).toBeGreaterThanOrEqual(3); // Available Commands, Admin Commands, Other Messages

    // Check that sections are properly separated
    expect(sentMessage).toMatch(
      /\*Available Commands:\*\n.*\n\n\*Admin Commands:\*\n.*\n\n\*Other Messages:\*/s
    );
  });
});
