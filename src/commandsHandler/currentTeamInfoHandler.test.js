const { KILZI_CHAT_ID } = require('../constants');

const mockCalculateTeamInfo = jest.fn();

jest.mock('../utils', () => ({
  calculateTeamInfo: mockCalculateTeamInfo,
  sendMessageToUser: jest.fn((bot, chatId, msg, opts) =>
    opts !== undefined ? bot.sendMessage(chatId, msg, opts) : bot.sendMessage(chatId, msg)
  ),
}));

const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  sharedKey,
} = require('../cache');

const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');

describe('calcCurrentTeamInfo', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
  });

  it('should send missing cache message if drivers cache is missing', async () => {
    // Only constructors and currentTeam set
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: [],
      constructors: [],
      costCapRemaining: 0,
    };

    await calcCurrentTeamInfo(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
    expect(mockCalculateTeamInfo).not.toHaveBeenCalled();
  });

  it('should send missing cache message if constructors cache is missing', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: [],
      constructors: [],
      costCapRemaining: 0,
    };

    await calcCurrentTeamInfo(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
    expect(mockCalculateTeamInfo).not.toHaveBeenCalled();
  });

  it('should send missing cache message if current team cache is missing', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };

    await calcCurrentTeamInfo(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
    expect(mockCalculateTeamInfo).not.toHaveBeenCalled();
  });

  it('should calculate and send current team info correctly', async () => {
    // Setup mock cache data
    const mockDrivers = {
      VER: { price: 30.5, expectedPoints: 30, expectedPriceChange: 1 },
      HAM: { price: 25.0, expectedPoints: 20, expectedPriceChange: 1 },
    };
    const mockConstructors = {
      RBR: { price: 20.0, expectedPoints: 30, expectedPriceChange: 1 },
      MER: { price: 15.0, expectedPoints: 30, expectedPriceChange: 1 },
    };
    const mockCurrentTeam = {
      drivers: ['VER', 'HAM'],
      constructors: ['RBR', 'MER'],
      costCapRemaining: 3.5,
    };

    driversCache[KILZI_CHAT_ID] = mockDrivers;
    constructorsCache[KILZI_CHAT_ID] = mockConstructors;
    currentTeamCache[KILZI_CHAT_ID] = mockCurrentTeam;

    const expectedTotalPrice = 30.5 + 25.0 + 20.0 + 15.0; // 90.5
    const expectedCostCap = 3.5;
    const expectedBudget = expectedTotalPrice + expectedCostCap; // 94.0
    const expectedPoints = 30 + 20 + 30 + 30; // 110
    const expectedPriceChange = 1 + 1 + 1 + 1; // 4

    // Mock the calculateTeamInfo function
    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: expectedTotalPrice,
      costCapRemaining: expectedCostCap,
      overallBudget: expectedBudget,
      teamExpectedPoints: expectedPoints,
      teamPriceChange: expectedPriceChange,
    });

    await calcCurrentTeamInfo(botMock, KILZI_CHAT_ID);

    expect(mockCalculateTeamInfo).toHaveBeenCalledWith(
      mockCurrentTeam,
      mockDrivers,
      mockConstructors
    );

    const expectedMessage =
      `*Current Team Info:*\n` +
      `*Drivers & Constructors Total Price:* ${expectedTotalPrice.toFixed(
        2
      )}\n` +
      `*Cost Cap Remaining:* ${expectedCostCap.toFixed(2)}\n` +
      `*Total Budget:* ${expectedBudget.toFixed(2)}\n` +
      `*Expected Points:* ${expectedPoints.toFixed(2)}\n` +
      `*Expected Price Change:* ${expectedPriceChange.toFixed(2)}`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should use shared cache when chat-specific cache is not available', async () => {
    const mockDrivers = { VER: { price: 30.5 } };
    const mockConstructors = { RBR: { price: 20.0 } };
    const mockCurrentTeam = { drivers: ['VER'], constructors: ['RBR'] };

    // Set shared cache instead of chat-specific for drivers and constructors
    driversCache[sharedKey] = mockDrivers;
    constructorsCache[sharedKey] = mockConstructors;
    currentTeamCache[KILZI_CHAT_ID] = mockCurrentTeam;

    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: 50.5,
      costCapRemaining: 5.0,
      overallBudget: 55.5,
      teamExpectedPoints: 50,
      teamPriceChange: 2,
    });

    await calcCurrentTeamInfo(botMock, KILZI_CHAT_ID);

    expect(mockCalculateTeamInfo).toHaveBeenCalledWith(
      mockCurrentTeam,
      mockDrivers,
      mockConstructors
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Current Team Info:*'),
      { parse_mode: 'Markdown' }
    );
  });

  it('should format numbers correctly with two decimal places', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.567 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.123 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: ['VER'],
      constructors: ['RBR'],
    };

    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: 50.69012,
      costCapRemaining: 3.14159,
      overallBudget: 53.83171,
      teamExpectedPoints: 49.987654,
      teamPriceChange: 1.999999,
    });

    await calcCurrentTeamInfo(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Drivers & Constructors Total Price:* 50.69'),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Cost Cap Remaining:* 3.14'),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Total Budget:* 53.83'),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Expected Points:* 49.99'),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Expected Price Change:* 2.00'),
      { parse_mode: 'Markdown' }
    );
  });
});
