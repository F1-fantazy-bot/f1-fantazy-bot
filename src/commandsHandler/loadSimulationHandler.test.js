const { KILZI_CHAT_ID } = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
}));

const { handleLoadSimulation } = require('./loadSimulationHandler');

describe('handleLoadSimulation', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReset();
    mockIsAdminMessage.mockReturnValue(true);
  });

  it('should deny access if user is not admin', async () => {
    mockIsAdminMessage.mockReturnValue(false);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can use this command.'
    );
  });

  it('should handle missing readJsonFromStorage function', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/load_simulation',
    };

    // The function catches the ReferenceError and sends an error message
    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('Failed to fetch JSON data:')
    );
  });

  it('should work with different chat IDs for admin users', async () => {
    const differentChatId = 'admin_chat_789';
    const msgMock = {
      chat: { id: differentChatId },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      differentChatId,
      expect.stringContaining('Failed to fetch JSON data:')
    );
  });

  it('should verify admin check is called first', async () => {
    mockIsAdminMessage.mockReturnValue(false);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    // For non-admin users, only the denial message should be sent
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can use this command.'
    );
    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });
});
