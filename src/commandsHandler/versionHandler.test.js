const { KILZI_CHAT_ID } = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
  sendMessageToUser: jest.fn((bot, chatId, msg, opts) =>
    opts !== undefined ? bot.sendMessage(chatId, msg, opts) : bot.sendMessage(chatId, msg)
  ),
}));

const { handleVersionCommand } = require('./versionHandler');

describe('handleVersionCommand', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReset();
    mockIsAdminMessage.mockReturnValue(true);
    process.env.COMMIT_ID = 'abc123';
    process.env.COMMIT_MESSAGE = 'test commit';
    process.env.COMMIT_LINK = 'http://example.com/commit';
  });

  it('should send version info to admin', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/version',
    };

    await handleVersionCommand(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `Commit ID: abc123\nCommit message: test commit\nLink: http://example.com/commit`
    );
  });

  it('should deny access for non-admin users', async () => {
    mockIsAdminMessage.mockReturnValue(false);
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/version',
    };

    await handleVersionCommand(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can use this command.'
    );
  });
});
