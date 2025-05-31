const { KILZI_CHAT_ID } = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(true);
const mockLoadSimulationData = jest.fn().mockResolvedValue();

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
}));

jest.mock('../cacheInitializer', () => ({
  loadSimulationData: mockLoadSimulationData,
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
    mockLoadSimulationData.mockReset();
    mockLoadSimulationData.mockResolvedValue();
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

  it('should work with different chat IDs for admin users', async () => {
    const differentChatId = 'admin_chat_789';
    const msgMock = {
      chat: { id: differentChatId },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockLoadSimulationData).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      differentChatId,
      'Simulation data fetched and cached successfully.'
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

  it('should successfully load simulation data and send success message', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockLoadSimulationData).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Simulation data fetched and cached successfully.'
    );
  });

  it('should handle loadSimulationData failure and send error message', async () => {
    const errorMessage = 'Network connection failed';
    mockLoadSimulationData.mockRejectedValue(new Error(errorMessage));

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockLoadSimulationData).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `Failed to load simulation data: ${errorMessage}`
    );
  });
});
