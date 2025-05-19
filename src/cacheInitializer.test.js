const { validateJsonData } = require('./utils');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationNameCache,
  sharedKey,
} = require('./cache');
const { LOG_CHANNEL_ID } = require('./constants');
const azureStorageService = require('./azureStorageService');
const { initializeCaches } = require('./cacheInitializer');

// Mock dependencies
jest.mock('./utils', () => ({
  validateJsonData: jest.fn().mockResolvedValue(true),
}));

jest.mock('./azureStorageService', () => ({
  getFantasyData: jest.fn(),
  listAllUserTeamData: jest.fn(),
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
  const mockUserTeams = [
    {
      chatId: '123',
      teamData: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
      },
    },
    {
      chatId: '456',
      teamData: {
        drivers: ['VER'],
        constructors: ['RBR'],
      },
    },
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
    Object.keys(simulationNameCache).forEach(
      (key) => delete simulationNameCache[key]
    );

    // Setup mock implementations
    validateJsonData.mockResolvedValue(true);
    azureStorageService.getFantasyData.mockResolvedValue(mockFantasyData);
    azureStorageService.listAllUserTeamData.mockResolvedValue(mockUserTeams);
  });

  it('should initialize all caches with data from Azure Storage', async () => {
    await initializeCaches(mockBot);

    // Verify Azure Storage was queried
    expect(azureStorageService.getFantasyData).toHaveBeenCalled();
    expect(azureStorageService.listAllUserTeamData).toHaveBeenCalled();

    // Verify success message was sent
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      LOG_CHANNEL_ID,
      expect.stringContaining('downloaded successfully')
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

    // Verify user teams were cached correctly
    mockUserTeams.forEach(({ chatId, teamData }) => {
      expect(currentTeamCache[chatId]).toEqual(teamData);
    });

    // Verify user teams loaded message
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      LOG_CHANNEL_ID,
      expect.stringContaining(`Loaded ${mockUserTeams.length} user teams`)
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
    azureStorageService.getFantasyData.mockRejectedValue(
      new Error('Missing required Azure storage configuration')
    );

    await expect(initializeCaches(mockBot)).rejects.toThrow(
      'Missing required Azure storage configuration'
    );
  });
});
