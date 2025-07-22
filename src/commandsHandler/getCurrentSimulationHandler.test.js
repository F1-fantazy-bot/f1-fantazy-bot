const {
  KILZI_CHAT_ID,
  COMMAND_RESET_CACHE,
  COMMAND_LOAD_SIMULATION,
} = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(false);
const mockFormatDateTime = jest.fn().mockReturnValue({
  dateStr: 'Saturday, 14 June 2025',
  timeStr: '12:24 GMT+3',
});

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
  formatDateTime: mockFormatDateTime,
}));

const {
  getPrintableCache,
  driversCache,
  constructorsCache,
  simulationInfoCache,
  sharedKey,
} = require('../cache');
jest.mock('../cache', () => ({
  driversCache: {},
  constructorsCache: {},
  simulationInfoCache: {},
  getPrintableCache: jest.fn(),
  languageCache: {},
  sharedKey: 'defaultSharedKey',
}));

const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');

describe('handleGetCurrentSimulation', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReset();
    mockIsAdminMessage.mockReturnValue(false);
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete simulationInfoCache[sharedKey];
  });

  it('should tell user to reset cache when they have data in their cache', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_current_simulation',
    };

    await handleGetCurrentSimulation(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `You currently have data in your cache. To use data from a simulation, please run ${COMMAND_RESET_CACHE} first.`
    );
  });

  it('should tell user to reset cache when they have constructors in their cache', async () => {
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_current_simulation',
    };

    await handleGetCurrentSimulation(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `You currently have data in your cache. To use data from a simulation, please run ${COMMAND_RESET_CACHE} first.`
    );
  });

  it('should tell user no simulation is loaded when simulation name is not set', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_current_simulation',
    };

    await handleGetCurrentSimulation(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `No simulation data is currently loaded. Please use ${COMMAND_LOAD_SIMULATION} to load simulation data.`
    );
  });

  it('should display simulation data when available', async () => {
    const mockPrintableCache = '*Simulation Data:*\nVER - 30.5M\nHAM - 25.0M';
    const mockSimulationName = 'Test Simulation v1.0';

    getPrintableCache.mockReturnValue(mockPrintableCache);
    simulationInfoCache[sharedKey] = {
      name: mockSimulationName,
      lastUpdate: '2025-06-14T09:24:00.000Z',
    };

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_current_simulation',
    };

    await handleGetCurrentSimulation(botMock, msgMock);

    expect(getPrintableCache).toHaveBeenCalledWith(sharedKey);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      mockPrintableCache,
      { parse_mode: 'Markdown' }
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `Current simulation: ${mockSimulationName}\nLast updated: Saturday, 14 June 2025 at 12:24 GMT+3`
    );
  });

  it('should show admin tip when user is admin', async () => {
    mockIsAdminMessage.mockReturnValue(true);

    const mockPrintableCache = '*Simulation Data:*\nVER - 30.5M';
    const mockSimulationName = 'Admin Simulation';

    getPrintableCache.mockReturnValue(mockPrintableCache);
    simulationInfoCache[sharedKey] = {
      name: mockSimulationName,
      lastUpdate: null,
    };

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_current_simulation',
    };

    await handleGetCurrentSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `💡 Tip: If the simulation seems outdated, you can run ${COMMAND_LOAD_SIMULATION} to update the current simulation.`
    );
  });

  it('should not show admin tip when user is not admin', async () => {
    const mockPrintableCache = '*Simulation Data:*\nVER - 30.5M';
    const mockSimulationName = 'User Simulation';

    getPrintableCache.mockReturnValue(mockPrintableCache);
    simulationInfoCache[sharedKey] = {
      name: mockSimulationName,
      lastUpdate: '2025-06-20T15:30:00.000Z',
    };

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/get_current_simulation',
    };

    await handleGetCurrentSimulation(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);

    // Should not send the admin tip
    expect(botMock.sendMessage).not.toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('💡 Tip:')
    );

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2); // Cache data and combined simulation info
  });
});
