const { KILZI_CHAT_ID } = require('../constants');

const mockValidateJsonData = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  validateJsonData: mockValidateJsonData,
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
  remainingRaceCountCache,
  userCache,
} = require('../cache');

const { handleBestTeamsMessage } = require('./bestTeamsHandler');

describe('handleBestTeamsMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };
  const TEAM_ID = 'T1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateJsonData.mockReset();
    mockValidateJsonData.mockReturnValue(true);
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
    delete remainingRaceCountCache[sharedKey];
    delete userCache[String(KILZI_CHAT_ID)];
  });

  it('should send no teams message if no current team cache exists', async () => {
    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      "No teams found. Please run /follow_league to follow your F1 Fantasy league (if you haven't yet), then /teams_tracker to pick teams to track.",
    );
  });

  it('should send missing cache message if drivers cache is missing', async () => {
    // Only constructors and currentTeam set
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: {
        drivers: [],
        constructors: [],
        costCapRemaining: 0,
      },
    };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
    );
  });

  it('should send missing cache message if constructors cache is missing', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: {
        drivers: [],
        constructors: [],
        costCapRemaining: 0,
      },
    };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
    );
  });

  it('should send missing cache message if current team cache is missing for resolved team', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    // currentTeamCache has a team entry but the resolved team data is empty
    currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: null };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
    );
  });

  it('should return early if validation fails', async () => {
    mockValidateJsonData.mockReturnValue(false);

    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: {
        drivers: ['VER'],
        constructors: ['RBR'],
        costCapRemaining: 5.0,
      },
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
    currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: mockCurrentTeam };
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: 'LIMITLESS_CHIP' };
    remainingRaceCountCache[sharedKey] = 22;
    userCache[String(KILZI_CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 1.65 },
    };

    const mockBestTeams = [
      {
        row: 1,
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        boost_driver: 'VER',
        total_price: 96.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 100.25,
        budget_adjusted_points: 172.85,
        expected_price_change: 2.5,
      },
      {
        row: 2,
        drivers: ['HAM', 'VER'],
        constructors: ['MER', 'RBR'],
        boost_driver: 'HAM',
        total_price: 96.5,
        transfers_needed: 2,
        penalty: 0,
        projected_points: 98.75,
        budget_adjusted_points: 158.15,
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
      'LIMITLESS_CHIP',
      1.65,
      22,
    );

    expect(bestTeamsCache[KILZI_CHAT_ID][TEAM_ID]).toEqual({
      currentTeam: mockCurrentTeam,
      bestTeams: mockBestTeams,
    });

    const expectedMessage =
      `*Team 1 (Current Team)*\n` +
      `*Drivers:* VER, HAM\n` +
      `*Constructors:* RBR, MER\n` +
      `*Boost Driver:* VER\n` +
      `*Total Price:* 96.5\n` +
      `*Transfers Needed:* 0\n` +
      `*Penalty:* 0\n` +
      `*Projected Points:* 100.25\n` +
      `*Budget-Adjusted Points:* 172.85\n` +
      `*Expected Price Change:* 2.5\n\n` +
      `*Team 2*\n` +
      `*Drivers:* HAM, VER\n` +
      `*Constructors:* MER, RBR\n` +
      `*Boost Driver:* HAM\n` +
      `*Total Price:* 96.5\n` +
      `*Transfers Needed:* 2\n` +
      `*Penalty:* 0\n` +
      `*Projected Points:* 98.75\n` +
      `*Budget-Adjusted Points:* 158.15\n` +
      `*Expected Price Change:* 1.8`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' },
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Please send a number to get the required changes to that team.',
    );
  });

  it('should use shared cache when chat-specific cache is not available', async () => {
    const mockDrivers = { VER: { price: 30.5 } };
    const mockConstructors = { RBR: { price: 20.0 } };
    const mockCurrentTeam = { drivers: ['VER'], constructors: ['RBR'] };

    // Set shared cache instead of chat-specific for drivers and constructors
    driversCache[sharedKey] = mockDrivers;
    constructorsCache[sharedKey] = mockConstructors;
    currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: mockCurrentTeam };

    const mockBestTeams = [
      {
        row: 1,
        drivers: 'VER',
        constructors: 'RBR',
        boost_driver: 'VER',
        total_price: 50.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 50,
        budget_adjusted_points: 50,
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
      undefined,
      0,
      0,
    );

    const sentMessage = botMock.sendMessage.mock.calls[0][1];
    expect(sentMessage).not.toContain('*Budget-Adjusted Points:*');
  });

  it('should still calculate best teams when remaining race count is missing for Pure Points', async () => {
    const mockDrivers = { VER: { price: 30.5 } };
    const mockConstructors = { RBR: { price: 20.0 } };
    const mockCurrentTeam = { drivers: ['VER'], constructors: ['RBR'] };

    driversCache[KILZI_CHAT_ID] = mockDrivers;
    constructorsCache[KILZI_CHAT_ID] = mockConstructors;
    currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: mockCurrentTeam };
    calculateBestTeams.mockReturnValue([]);

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).toHaveBeenCalledWith(
      {
        Drivers: mockDrivers,
        Constructors: mockConstructors,
        CurrentTeam: mockCurrentTeam,
      },
      undefined,
      0,
      0,
    );
  });

  it('should fail when remaining race count is missing for non-zero ranking mode', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: {
        drivers: ['VER'],
        constructors: ['RBR'],
      },
    };
    userCache[String(KILZI_CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 2 },
    };

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Remaining race count is unavailable right now. Switch to Pure Points or try again later.',
    );
  });

  it('should show adjusted expected points when ranking mode is not default', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: {
        drivers: ['VER'],
        constructors: ['RBR'],
      },
    };
    remainingRaceCountCache[sharedKey] = 22;
    userCache[String(KILZI_CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 2 },
    };

    calculateBestTeams.mockReturnValue([
      {
        row: 1,
        drivers: ['VER'],
        constructors: ['RBR'],
        boost_driver: 'VER',
        total_price: 50.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 60,
        budget_adjusted_points: 81,
        expected_price_change: 0.5,
      },
    ]);

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('*Budget-Adjusted Points:* 81');
  });

  it('should handle teams with extra Boost driver', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: {
        drivers: ['VER'],
        constructors: ['RBR'],
      },
    };

    const mockBestTeams = [
      {
        row: 1,
        drivers: ['VER'],
        constructors: ['RBR'],
        extra_boost_driver: 'HAM',
        boost_driver: 'VER',
        total_price: 50.5,
        transfers_needed: 0,
        penalty: 0,
        projected_points: 60,
        budget_adjusted_points: 60,
        expected_price_change: 1,
      },
    ];

    calculateBestTeams.mockReturnValue(mockBestTeams);

    await handleBestTeamsMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Extra Boost Driver:* HAM'),
      { parse_mode: 'Markdown' },
    );
  });
});
