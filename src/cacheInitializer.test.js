const { validateJsonData } = require('./utils');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationInfoCache,
  sharedKey,
  nextRaceInfoCache,
  remainingRaceCountCache,
  userCache,
} = require('./cache');
const {
  getFantasyData,
  listAllUserTeamData,
  getNextRaceInfoData,
  getLeagueTeamsData,
  saveUserTeam,
} = require('./azureStorageService');
const { listAllUsers } = require('./userRegistryService');
const {
  initializeCaches,
  loadSimulationData,
  refreshLeagueSourcedTeams,
} = require('./cacheInitializer');
const { fetchRemainingRaceCount } = require('./raceScheduleService');

// Mock dependencies
const utils = require('./utils');
jest.mock('./utils', () => ({
  validateJsonData: jest.fn().mockResolvedValue(true),
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  sendErrorMessage: jest.fn().mockResolvedValue(undefined),
  sendMessageToAdmins: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./azureStorageService', () => ({
  getFantasyData: jest.fn(),
  listAllUserTeamData: jest.fn(),
  getNextRaceInfoData: jest.fn(),
  getLeagueTeamsData: jest.fn(),
  saveUserTeam: jest.fn(),
}));

jest.mock('./userRegistryService', () => ({
  listAllUsers: jest.fn(),
}));

jest.mock('./raceScheduleService', () => ({
  fetchRemainingRaceCount: jest.fn(),
}));

describe('cacheInitializer', () => {
  // Mock bot instance
  const mockBot = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };

  // Mock fantasy data
  const mockFantasyData = {
    SimulationName: 'Test Simulation',
    SimulationLastUpdate: '2025-06-14T09:24:00.000Z',
    Drivers: [
      { DR: 'VER', price: 30.5 },
      { DR: 'HAM', price: 25.0 },
    ],
    Constructors: [
      { CN: 'RBR', price: 20.0 },
      { CN: 'MER', price: 15.0 },
    ],
  };

  // Mock user teams data
  const mockUserTeams = {
    123: {
      drivers: ['VER', 'HAM'],
      constructors: ['RBR', 'MER'],
    },
    456: {
      drivers: ['VER'],
      constructors: ['RBR'],
    },
  };

  // Mock users (combined data from UserRegistry)
  const mockUsers = [
    {
      chatId: '123',
      chatName: 'Alice',
      lang: 'en',
      nickname: 'Max',
      bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 1.65 }),
      selectedBestTeamByTeam: JSON.stringify({
        T1: {
          drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
          constructors: ['RBR', 'FER'],
          boostDriver: 'VER',
          extraBoostDriver: 'HAM',
        },
      }),
    },
    { chatId: '456', chatName: 'Bob', lang: 'he', nickname: 'Lewis' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all caches
    Object.keys(driversCache).forEach((key) => delete driversCache[key]);
    Object.keys(constructorsCache).forEach(
      (key) => delete constructorsCache[key]
    );
    Object.keys(currentTeamCache).forEach(
      (key) => delete currentTeamCache[key]
    );
    Object.keys(simulationInfoCache).forEach(
      (key) => delete simulationInfoCache[key]
    );
    Object.keys(nextRaceInfoCache).forEach(
      (key) => delete nextRaceInfoCache[key]
    );
    Object.keys(remainingRaceCountCache).forEach(
      (key) => delete remainingRaceCountCache[key]
    );
    Object.keys(userCache).forEach((key) => delete userCache[key]);

    // Setup mock implementations
    validateJsonData.mockResolvedValue(true);
    getFantasyData.mockResolvedValue(mockFantasyData);
    listAllUserTeamData.mockResolvedValue(mockUserTeams);
    listAllUsers.mockResolvedValue(mockUsers);
    getNextRaceInfoData.mockResolvedValue({
      raceName: 'Test Race',
      season: '2025',
    });
    fetchRemainingRaceCount.mockResolvedValue(22);
  });

  it('should initialize all caches with data from Azure Storage', async () => {
    await initializeCaches(mockBot);

    // Verify Azure Storage was queried
    expect(getFantasyData).toHaveBeenCalled();
    expect(listAllUserTeamData).toHaveBeenCalled();
    expect(listAllUsers).toHaveBeenCalled();
    expect(getNextRaceInfoData).toHaveBeenCalled();
    expect(fetchRemainingRaceCount).toHaveBeenCalled();

    // Verify success message was sent via utils
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Fantasy data json downloaded successfully')
    );
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Next race info loaded successfully')
    );

    // Verify simulation info was cached
    expect(simulationInfoCache[sharedKey]).toEqual({
      name: mockFantasyData.SimulationName,
      lastUpdate: mockFantasyData.SimulationLastUpdate,
    });

    // Verify next race info was cached
    expect(nextRaceInfoCache[sharedKey]).toEqual({
      raceName: 'Test Race',
      season: '2025',
    });
    expect(remainingRaceCountCache[sharedKey]).toBe(22);

    // Verify drivers were cached correctly
    expect(driversCache[sharedKey]).toEqual({
      VER: mockFantasyData.Drivers[0],
      HAM: mockFantasyData.Drivers[1],
    });

    // Verify constructors were cached correctly
    expect(constructorsCache[sharedKey]).toEqual({
      RBR: mockFantasyData.Constructors[0],
      MER: mockFantasyData.Constructors[1],
    });

    // Verify user teams were cached correctly
    expect(currentTeamCache).toEqual(mockUserTeams);

    // Verify userCache was populated correctly
    expect(userCache).toEqual({
      123: {
        chatName: 'Alice',
        lang: 'en',
        nickname: 'Max',
        bestTeamBudgetChangePointsPerMillion: { T1: 1.65 },
        selectedBestTeamByTeam: {
          T1: {
            drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
            constructors: ['RBR', 'FER'],
            boostDriver: 'VER',
            extraBoostDriver: 'HAM',
          },
        },
      },
      456: {
        chatName: 'Bob',
        lang: 'he',
        nickname: 'Lewis',
        bestTeamBudgetChangePointsPerMillion: {},
        selectedBestTeamByTeam: {},
      },
    });

    // Verify user teams loaded message
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining(
        `Loaded ${Object.keys(mockUserTeams).length} user teams`
      )
    );
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining(
        `Loaded ${mockUsers.length} users into cache`
      )
    );
  });

  it('should keep startup successful when remaining race count fetch fails', async () => {
    fetchRemainingRaceCount.mockRejectedValue(new Error('schedule unavailable'));

    await initializeCaches(mockBot);

    expect(remainingRaceCountCache[sharedKey]).toBeUndefined();
    expect(utils.sendErrorMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Failed to load remaining race count: schedule unavailable'),
    );
  });

  it('should throw error if fantasy data validation fails', async () => {
    // Make validation fail
    validateJsonData.mockResolvedValue(false);

    await expect(initializeCaches(mockBot)).rejects.toThrow(
      'Fantasy data validation failed'
    );
  });

  it('should handle missing Azure configuration', async () => {
    getFantasyData.mockRejectedValue(
      new Error('Missing required Azure storage configuration')
    );

    await expect(initializeCaches(mockBot)).rejects.toThrow(
      'Missing required Azure storage configuration'
    );
  });

  it('should load simulation data with loadSimulationData', async () => {
    // Ensure validation returns true for this test
    validateJsonData.mockResolvedValue(true);

    await loadSimulationData(mockBot);

    // Verify Azure Storage was queried for fantasy data
    expect(getFantasyData).toHaveBeenCalled();

    // Verify success message was sent via utils
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Fantasy data json downloaded successfully')
    );
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Simulation data loaded successfully')
    );

    // Verify simulation info was cached
    expect(simulationInfoCache[sharedKey]).toEqual({
      name: mockFantasyData.SimulationName,
      lastUpdate: mockFantasyData.SimulationLastUpdate,
    });

    // Verify drivers were cached correctly
    expect(driversCache[sharedKey]).toEqual({
      VER: mockFantasyData.Drivers[0],
      HAM: mockFantasyData.Drivers[1],
    });

    // Verify constructors were cached correctly
    expect(constructorsCache[sharedKey]).toEqual({
      RBR: mockFantasyData.Constructors[0],
      MER: mockFantasyData.Constructors[1],
    });
  });

  it('should throw error if simulation data validation fails', async () => {
    // Make validation fail
    validateJsonData.mockResolvedValue(false);

    await expect(loadSimulationData(mockBot)).rejects.toThrow(
      'Fantasy data validation failed'
    );
  });

  describe('refreshLeagueSourcedTeams', () => {
    beforeEach(() => {
      getLeagueTeamsData.mockReset();
      saveUserTeam.mockReset().mockResolvedValue(undefined);
    });

    it('refreshes league-sourced teams (ids containing "_") from the latest league blob', async () => {
      currentTeamCache[111] = {
        T1: { drivers: ['OLD'], constructors: ['OLD'] },
        'ABC_My-Team': { drivers: ['STALE'], constructors: ['STALE'] },
      };
      currentTeamCache[222] = {
        ABC_Other: { drivers: ['STALE'], constructors: ['STALE'] },
      };

      getLeagueTeamsData.mockResolvedValue({
        leagueName: 'League ABC',
        teams: [
          {
            teamName: 'My Team',
            position: 1,
            budget: 100,
            transfersRemaining: 2,
            drivers: [
              { name: 'M. Verstappen', price: 30, isCaptain: true },
              { name: 'L. Norris', price: 25 },
            ],
            constructors: [{ name: 'Red Bull Racing', price: 20 }],
          },
          {
            teamName: 'Other',
            position: 2,
            budget: 90,
            transfersRemaining: 1,
            drivers: [{ name: 'O. Bearman', price: 10, isCaptain: true }],
            constructors: [{ name: 'Racing Bulls', price: 5 }],
          },
        ],
      });

      await refreshLeagueSourcedTeams(mockBot);

      // Non-league id is untouched
      expect(currentTeamCache[111].T1).toEqual({
        drivers: ['OLD'],
        constructors: ['OLD'],
      });
      // League-sourced teams are rebuilt with mapped codes
      expect(currentTeamCache[111]['ABC_My-Team']).toEqual(
        expect.objectContaining({
          drivers: ['VER', 'NOR'],
          constructors: ['RED'],
          boost: 'VER',
          freeTransfers: 2,
        }),
      );
      expect(currentTeamCache[222].ABC_Other).toEqual(
        expect.objectContaining({
          drivers: ['BEA'],
          constructors: ['VRB'],
          boost: 'BEA',
        }),
      );
      // League blob fetched once per league (cached within the function)
      expect(getLeagueTeamsData).toHaveBeenCalledTimes(1);
      expect(getLeagueTeamsData).toHaveBeenCalledWith('ABC');
      // Persisted back to storage
      expect(saveUserTeam).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for users with only T1/T2/T3 style ids', async () => {
      currentTeamCache[111] = { T1: { drivers: ['OLD'] } };

      await refreshLeagueSourcedTeams(mockBot);

      expect(getLeagueTeamsData).not.toHaveBeenCalled();
      expect(saveUserTeam).not.toHaveBeenCalled();
      expect(currentTeamCache[111]).toEqual({ T1: { drivers: ['OLD'] } });
    });

    it('leaves cached data untouched when the team is missing in the league blob', async () => {
      currentTeamCache[111] = {
        ABC_Gone: { drivers: ['STALE'] },
      };
      getLeagueTeamsData.mockResolvedValue({ teams: [] });

      await refreshLeagueSourcedTeams(mockBot);

      expect(currentTeamCache[111].ABC_Gone).toEqual({ drivers: ['STALE'] });
      expect(saveUserTeam).not.toHaveBeenCalled();
    });
  });
});
