const { KILZI_CHAT_ID } = require('../constants');

const mockValidateJsonData = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  validateJsonData: mockValidateJsonData,
  sendMessageToUser: jest.fn((bot, chatId, msg, opts) =>
    opts !== undefined
      ? bot.sendMessage(chatId, msg, opts)
      : bot.sendMessage(chatId, msg)
  ),
}));

const { calculateBestTeams } = require('../bestTeamsCalculator');
jest.mock('../bestTeamsCalculator', () => ({
  calculateBestTeams: jest.fn(),
}));

const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
} = require('../cache');

const { handleBestTeamsMessage } = require('./bestTeamsHandler');

describe('handleBestTeamsMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateJsonData.mockReset();
    mockValidateJsonData.mockReturnValue(true);
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
  });

  it('should handle /best_teams command and send missing cache message if no cache', async () => {
    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if drivers cache is missing', async () => {
    // Only constructors and currentTeam set
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: [],
      constructors: [],
      costCapRemaining: 0,
    };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if constructors cache is missing', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: [],
      constructors: [],
      costCapRemaining: 0,
    };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if current team cache is missing', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should return early if validation fails', async () => {
    mockValidateJsonData.mockReturnValue(false);

    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: ['VER'],
      constructors: ['RBR'],
      costCapRemaining: 5.0,
    };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(mockValidateJsonData).toHaveBeenCalled();
    expect(calculateBestTeams).not.toHaveBeenCalled();
  });

  it('should calculate and display best teams when all cache is available', async () => {
    const mockDrivers = {
      VER: { price: 30.5, expectedPoints: 25 },
      HAM: { price: 28.0, expectedPoints: 20 },
    };
    const mockConstructors = {
      RBR: { price: 20.0, expectedPoints: 30 },
      MER: { price: 18.0, expectedPoints: 25 },
    };
    const mockCurrentTeam = {
      drivers: ['VER'],
      constructors: ['RBR'],
      costCapRemaining: 5.0,
    };

    driversCache[KILZI_CHAT_ID] = mockDrivers;
    constructorsCache[KILZI_CHAT_ID] = mockConstructors;
    currentTeamCache[KILZI_CHAT_ID] = mockCurrentTeam;
    selectedChipCache[KILZI_CHAT_ID] = 'LIMITLESS_CHIP';

    const mockBestTeams = [
      {
        row: 1,
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        drs_driver: 'VER',
        total_price: 96.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 100.25,
        expected_price_change: 2.5,
      },
      {
        row: 2,
        drivers: ['HAM', 'VER'],
        constructors: ['MER', 'RBR'],
        drs_driver: 'HAM',
        total_price: 96.5,
        transfers_needed: 2,
        penalty: 0,
        projected_points: 98.75,
        expected_price_change: 1.8,
      },
    ];

    calculateBestTeams.mockReturnValue(mockBestTeams);

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).toHaveBeenCalledWith(
      {
        Drivers: mockDrivers,
        Constructors: mockConstructors,
        CurrentTeam: mockCurrentTeam,
      },
      'LIMITLESS_CHIP'
    );

    expect(bestTeamsCache[KILZI_CHAT_ID]).toEqual({
      currentTeam: mockCurrentTeam,
      bestTeams: mockBestTeams,
    });

    const expectedMessage =
      `*Team 1 (Current Team)*\n` +
      `*Drivers:* VER, HAM\n` +
      `*Constructors:* RBR, MER\n` +
      `*DRS Driver:* VER\n` +
      `*Total Price:* 96.5\n` +
      `*Transfers Needed:* 0\n` +
      `*Penalty:* 0\n` +
      `*Projected Points:* 100.25\n` +
      `*Expected Price Change:* 2.5\n\n` +
      `*Team 2*\n` +
      `*Drivers:* HAM, VER\n` +
      `*Constructors:* MER, RBR\n` +
      `*DRS Driver:* HAM\n` +
      `*Total Price:* 96.5\n` +
      `*Transfers Needed:* 2\n` +
      `*Penalty:* 0\n` +
      `*Projected Points:* 98.75\n` +
      `*Expected Price Change:* 1.8`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Please send a number to get the required changes to that team.'
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

    const mockBestTeams = [
      {
        row: 1,
        drivers: 'VER',
        constructors: 'RBR',
        drs_driver: 'VER',
        total_price: 50.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 50,
        expected_price_change: 1,
      },
    ];

    calculateBestTeams.mockReturnValue(mockBestTeams);

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).toHaveBeenCalledWith(
      {
        Drivers: mockDrivers,
        Constructors: mockConstructors,
        CurrentTeam: mockCurrentTeam,
      },
      undefined
    );
  });

  it('should handle teams with extra DRS driver', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: ['VER'],
      constructors: ['RBR'],
    };

    const mockBestTeams = [
      {
        row: 1,
        drivers: ['VER'],
        constructors: ['RBR'],
        extra_drs_driver: 'HAM',
        drs_driver: 'VER',
        total_price: 50.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 60,
        expected_price_change: 1,
      },
    ];

    calculateBestTeams.mockReturnValue(mockBestTeams);

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Extra DRS Driver:* HAM'),
      { parse_mode: 'Markdown' }
    );
  });
});
