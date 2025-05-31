const { validateJsonData } = require('./utils');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationNameCache,
  sharedKey,
  nextRaceInfoCache,
} = require('./cache');
const {
  getFantasyData,
  listAllUserTeamData,
  getNextRaceInfoData,
} = require('./azureStorageService');
const { initializeCaches, loadSimulationData } = require('./cacheInitializer');

// Mock dependencies
const utils = require('./utils');
jest.mock('./utils', () => ({
  validateJsonData: jest.fn().mockResolvedValue(true),
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  sendMessageToAdmins: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./azureStorageService', () => ({
  getFantasyData: jest.fn(),
  listAllUserTeamData: jest.fn(),
  getNextRaceInfoData: jest.fn(),
}));

describe('cacheInitializer', () => {
  // Mock bot instance
  const mockBot = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };

  // Mock fantasy data
  const mockFantasyData = {
    SimulationName: 'Test Simulation',
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
    Object.keys(simulationNameCache).forEach(
      (key) => delete simulationNameCache[key]
    );
    Object.keys(nextRaceInfoCache).forEach(
      (key) => delete nextRaceInfoCache[key]
    );

    // Setup mock implementations
    validateJsonData.mockResolvedValue(true);
    getFantasyData.mockResolvedValue(mockFantasyData);
    listAllUserTeamData.mockResolvedValue(mockUserTeams);
    getNextRaceInfoData.mockResolvedValue({
      raceName: 'Test Race',
      season: '2025',
    });
  });

  it('should initialize all caches with data from Azure Storage', async () => {
    await initializeCaches(mockBot);

    // Verify Azure Storage was queried
    expect(getFantasyData).toHaveBeenCalled();
    expect(listAllUserTeamData).toHaveBeenCalled();
    expect(getNextRaceInfoData).toHaveBeenCalled();

    // Verify success message was sent via utils
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Fantasy data json downloaded successfully')
    );
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining('Next race info loaded successfully')
    );

    // Verify simulation name was cached
    expect(simulationNameCache[sharedKey]).toBe(mockFantasyData.SimulationName);

    // Verify next race info was cached
    expect(nextRaceInfoCache[sharedKey]).toEqual({
      raceName: 'Test Race',
      season: '2025',
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

    // Verify user teams were cached correctly
    expect(currentTeamCache).toEqual(mockUserTeams);

    // Verify user teams loaded message
    expect(utils.sendLogMessage).toHaveBeenCalledWith(
      mockBot,
      expect.stringContaining(
        `Loaded ${Object.keys(mockUserTeams).length} user teams`
      )
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

    // Verify simulation name was cached
    expect(simulationNameCache[sharedKey]).toBe(mockFantasyData.SimulationName);

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
});
