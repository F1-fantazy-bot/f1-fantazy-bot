const { KILZI_CHAT_ID } = require('../constants');

const mockLoadSimulationData = jest.fn().mockResolvedValue();

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
    mockLoadSimulationData.mockReset();
    mockLoadSimulationData.mockResolvedValue();
  });

  it('should work with different chat IDs for all users', async () => {
    const differentChatId = 'user_chat_789';
    const msgMock = {
      chat: { id: differentChatId },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

    expect(mockLoadSimulationData).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      differentChatId,
      'Simulation data fetched and cached successfully.'
    );
  });

  it('should successfully load simulation data and send success message', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/load_simulation',
    };

    await handleLoadSimulation(botMock, msgMock);

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

    expect(mockLoadSimulationData).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `Failed to load simulation data: ${errorMessage}`
    );
  });
});
