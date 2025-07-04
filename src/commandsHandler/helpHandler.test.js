const {
  KILZI_CHAT_ID,
  MENU_CATEGORIES,
  COMMAND_BEST_TEAMS,
  USER_COMMANDS_CONFIG,
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

    expect(sentMessage).toContain('*F1 Fantasy Bot - Available Commands*');
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

    // Should include non-admin category titles
    expect(sentMessage).toContain('🏎️ Team Management');
    expect(sentMessage).toContain('📊 Analysis & Stats');
    expect(sentMessage).toContain('🔧 Utilities');
    expect(sentMessage).toContain('❓ Help & Menu');

    // Should NOT include admin category for regular users
    expect(sentMessage).not.toContain('👤 Admin Commands');

    // Should include help and menu commands
    const helpCommand = USER_COMMANDS_CONFIG.find(
      (cmd) => cmd.constant === '/help'
    );
    const menuCommand = USER_COMMANDS_CONFIG.find(
      (cmd) => cmd.constant === '/menu'
    );
    expect(sentMessage).toContain(
      `${helpCommand.constant.replace(/_/g, '\\_')} - ${
        helpCommand.description
      }`
    );
    expect(sentMessage).toContain(
      `${menuCommand.constant.replace(/_/g, '\\_')} - ${
        menuCommand.description
      }`
    );

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

    expect(sentMessage).toContain('*F1 Fantasy Bot - Available Commands*');
    expect(sentMessage).toContain('*Other Messages:*');

    // Should include all category titles including admin
    expect(sentMessage).toContain('🏎️ Team Management');
    expect(sentMessage).toContain('📊 Analysis & Stats');
    expect(sentMessage).toContain('🔧 Utilities');
    expect(sentMessage).toContain('👤 Admin Commands');
    expect(sentMessage).toContain('❓ Help & Menu');

    // Should include help and menu commands
    const helpCommand = USER_COMMANDS_CONFIG.find(
      (cmd) => cmd.constant === '/help'
    );
    const menuCommand = USER_COMMANDS_CONFIG.find(
      (cmd) => cmd.constant === '/menu'
    );
    expect(sentMessage).toContain(
      `${helpCommand.constant.replace(/_/g, '\\_')} - ${
        helpCommand.description
      }`
    );
    expect(sentMessage).toContain(
      `${menuCommand.constant.replace(/_/g, '\\_')} - ${
        menuCommand.description
      }`
    );

    // Should include admin category commands
    const adminCategory = Object.values(MENU_CATEGORIES).find(
      (cat) => cat.adminOnly
    );
    adminCategory.commands.forEach((cmd) => {
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
    mockIsAdminMessage.mockReturnValue(true); // Set as admin to test all commands

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/help',
    };

    await displayHelpMessage(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    // Check that commands with underscores are properly escaped for Markdown
    const allCommands = [];
    Object.values(MENU_CATEGORIES).forEach((category) => {
      category.commands.forEach((cmd) => {
        allCommands.push(cmd);
      });
    });

    // Add help and menu commands from USER_COMMANDS_CONFIG
    const helpCommand = USER_COMMANDS_CONFIG.find(
      (cmd) => cmd.constant === '/help'
    );
    const menuCommand = USER_COMMANDS_CONFIG.find(
      (cmd) => cmd.constant === '/menu'
    );
    allCommands.push(helpCommand, menuCommand);

    const commandsWithUnderscores = allCommands.filter((cmd) =>
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
    expect(sections.length).toBeGreaterThanOrEqual(5); // Header, Team Management, Analysis & Stats, Utilities, Admin Commands, Help & Menu, Other Messages

    // Check that the message starts with the correct header
    expect(sentMessage).toMatch(/^\*F1 Fantasy Bot - Available Commands\*/);

    // Check that menu categories are included
    expect(sentMessage).toMatch(/🏎️ Team Management/);
    expect(sentMessage).toMatch(/📊 Analysis & Stats/);
    expect(sentMessage).toMatch(/🔧 Utilities/);
    expect(sentMessage).toMatch(/👤 Admin Commands/);
    expect(sentMessage).toMatch(/❓ Help & Menu/);

    // Check that the message ends with Other Messages
    expect(sentMessage).toMatch(/\*Other Messages:\*/);
  });
});
