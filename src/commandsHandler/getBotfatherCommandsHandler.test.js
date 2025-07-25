const { KILZI_CHAT_ID, USER_COMMANDS_CONFIG } = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
}));

const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { setLanguage, t } = require('../i18n');

describe('handleGetBotfatherCommands', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReset();
    mockIsAdminMessage.mockReturnValue(true);
  });

  it('should send formatted command list if user is admin', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    const expectedBotFatherCommands = USER_COMMANDS_CONFIG.map(
      (cmd) => `${cmd.constant.substring(1)} - ${cmd.description}`
    ).join('\n');

    await handleGetBotfatherCommands(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedBotFatherCommands
    );
  });

  it('should deny access if user is not admin', async () => {
    mockIsAdminMessage.mockReturnValue(false);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    await handleGetBotfatherCommands(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can get BotFather commands.'
    );
  });

  it('should format commands correctly by removing leading slash', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    await handleGetBotfatherCommands(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    // Verify that commands are formatted without leading slash
    USER_COMMANDS_CONFIG.forEach((cmd) => {
      const expectedFormat = `${cmd.constant.substring(1)} - ${
        cmd.description
      }`;
      expect(sentMessage).toContain(expectedFormat);
      // Make sure the original format with slash is not present
      expect(sentMessage).not.toContain(`${cmd.constant} - ${cmd.description}`);
    });
  });

  it('should include all user commands', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    await handleGetBotfatherCommands(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    // Verify all commands are included
    USER_COMMANDS_CONFIG.forEach((cmd) => {
      expect(sentMessage).toContain(cmd.constant.substring(1));
      expect(sentMessage).toContain(cmd.description);
    });
  });

  it('should join commands with newlines', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    await handleGetBotfatherCommands(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    // Count newlines - should be one less than the number of commands
    const newlineCount = (sentMessage.match(/\n/g) || []).length;
    expect(newlineCount).toBe(USER_COMMANDS_CONFIG.length - 1);
  });

  it('should handle sendMessage errors gracefully', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    botMock.sendMessage.mockRejectedValueOnce(new Error('Network error'));

    await handleGetBotfatherCommands(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should work with different chat IDs', async () => {
    const differentChatId = 'different_chat_456';
    const msgMock = {
      chat: { id: differentChatId },
      text: '/get_botfather_commands',
    };

    await handleGetBotfatherCommands(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      differentChatId,
      expect.any(String)
    );
  });

  it('should handle different message structures', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
      from: { id: 123, first_name: 'Test User' },
    };

    await handleGetBotfatherCommands(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.any(String)
    );
  });

  it('should not translate descriptions even if language differs', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_botfather_commands',
    };

    setLanguage('he', KILZI_CHAT_ID);

    await handleGetBotfatherCommands(botMock, msgMock);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    USER_COMMANDS_CONFIG.forEach((cmd) => {
      expect(sentMessage).toContain(
        `${cmd.constant.substring(1)} - ${cmd.description}`
      );
      expect(sentMessage).not.toContain(
        `(${t(cmd.description, KILZI_CHAT_ID)})`
      );
    });
  });
});
