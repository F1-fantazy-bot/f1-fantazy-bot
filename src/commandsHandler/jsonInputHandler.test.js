const { KILZI_CHAT_ID } = require('../constants');

const mockValidateJsonData = jest.fn().mockResolvedValue(true);

jest.mock('../utils', () => ({
  validateJsonData: mockValidateJsonData,
}));

const azureStorageService = require('../azureStorageService');
jest.mock('../azureStorageService', () => ({
  saveUserTeam: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));

const { sendPrintableCache } = require('./printCacheHandler');
jest.mock('./printCacheHandler', () => ({
  sendPrintableCache: jest.fn(),
}));

const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  userCache,
  selectedChipCache,
  getPrintableCache,
} = require('../cache');

const { updateUserAttributes } = require('../userRegistryService');
const { handleJsonMessage } = require('./jsonInputHandler');

describe('handleJsonMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateJsonData.mockReset();
    mockValidateJsonData.mockResolvedValue(true);
    azureStorageService.saveUserTeam.mockClear();
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete userCache[String(KILZI_CHAT_ID)];
    delete selectedChipCache[KILZI_CHAT_ID];
  });

  it('should return early if validation fails', async () => {
    mockValidateJsonData.mockResolvedValue(false);

    const jsonData = {
      Drivers: [],
      Constructors: [],
      CurrentTeam: {},
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    expect(mockValidateJsonData).toHaveBeenCalledWith(
      botMock,
      jsonData,
      KILZI_CHAT_ID,
      true,
    );
    expect(azureStorageService.saveUserTeam).not.toHaveBeenCalled();
    expect(sendPrintableCache).not.toHaveBeenCalled();
  });

  it('should store JSON data and save to Azure Storage when validation passes', async () => {
    const jsonData = {
      Drivers: [
        { DR: 'VER', price: 30.5 },
        { DR: 'HAM', price: 25.0 },
      ],
      Constructors: [
        { CN: 'RBR', price: 20.0 },
        { CN: 'MER', price: 15.0 },
      ],
      CurrentTeam: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        costCapRemaining: 3.5,
      },
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    // Verify validation was called
    expect(mockValidateJsonData).toHaveBeenCalledWith(
      botMock,
      jsonData,
      KILZI_CHAT_ID,
      true,
    );

    // Verify data was stored in cache
    expect(driversCache[KILZI_CHAT_ID]).toBeDefined();
    expect(driversCache[KILZI_CHAT_ID].VER).toEqual({ DR: 'VER', price: 30.5 });
    expect(driversCache[KILZI_CHAT_ID].HAM).toEqual({ DR: 'HAM', price: 25.0 });

    expect(constructorsCache[KILZI_CHAT_ID]).toBeDefined();
    expect(constructorsCache[KILZI_CHAT_ID].RBR).toEqual({
      CN: 'RBR',
      price: 20.0,
    });
    expect(constructorsCache[KILZI_CHAT_ID].MER).toEqual({
      CN: 'MER',
      price: 15.0,
    });

    // Team is stored nested under T1 (default for new user)
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeDefined();
    expect(currentTeamCache[KILZI_CHAT_ID]['T1']).toEqual(jsonData.CurrentTeam);

    // Verify team was saved to Azure Storage with teamId
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
      'T1',
      jsonData.CurrentTeam,
    );

    // Verify printable cache was sent
    expect(sendPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID, botMock);
  });

  it('should store only CurrentTeam when Drivers and Constructors are missing', async () => {
    const existingDriversCache = { VER: { price: 30.5 } };
    const existingConstructorsCache = { RBR: { price: 20.0 } };
    driversCache[KILZI_CHAT_ID] = existingDriversCache;
    constructorsCache[KILZI_CHAT_ID] = existingConstructorsCache;
    bestTeamsCache[KILZI_CHAT_ID] = { T1: { cached: true } };
    // Set up existing team so resolveTeamIdForJson picks it up
    currentTeamCache[KILZI_CHAT_ID] = { T1: { drivers: ['VER'] } };

    const jsonData = {
      CurrentTeam: {
        drivers: ['VER', 'HAM', 'LEC', 'SAI', 'NOR'],
        constructors: ['RBR', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 0.2,
      },
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    expect(mockValidateJsonData).toHaveBeenCalledWith(
      botMock,
      jsonData,
      KILZI_CHAT_ID,
      true,
      false,
    );

    expect(driversCache[KILZI_CHAT_ID]).toBe(existingDriversCache);
    expect(constructorsCache[KILZI_CHAT_ID]).toBe(existingConstructorsCache);
    // Team data stored under T1 (auto-resolved since single team)
    expect(currentTeamCache[KILZI_CHAT_ID]['T1']).toEqual(jsonData.CurrentTeam);
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
      'T1',
      jsonData.CurrentTeam,
    );
    expect(sendPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID, botMock);
  });


  it('should store Teams payload from /print_cache output shape including metadata', async () => {
    const jsonData = {
      Drivers: [
        { DR: 'VER', price: 30.5 },
        { DR: 'HAM', price: 25.0 },
      ],
      Constructors: [
        { CN: 'RBR', price: 20.0 },
        { CN: 'MER', price: 15.0 },
      ],
      SelectedTeam: 'T2',
      Teams: {
        T1: {
          drivers: ['VER', 'HAM'],
          constructors: ['RBR', 'MER'],
          drsBoost: 'VER',
          freeTransfers: 1,
          costCapRemaining: 3.5,
          chip: 'EXTRA_DRS',
          bestTeamPointsWeight: 0.3,
        },
        T2: {
          drivers: ['HAM', 'VER'],
          constructors: ['MER', 'RBR'],
          drsBoost: 'HAM',
          freeTransfers: 2,
          costCapRemaining: 1.5,
          bestTeamPointsWeight: 0.9,
        },
      },
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    expect(mockValidateJsonData).toHaveBeenCalledWith(
      botMock,
      jsonData,
      KILZI_CHAT_ID,
      false,
    );

    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual({
      T1: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 1,
        costCapRemaining: 3.5,
      },
      T2: {
        drivers: ['HAM', 'VER'],
        constructors: ['MER', 'RBR'],
        drsBoost: 'HAM',
        freeTransfers: 2,
        costCapRemaining: 1.5,
      },
    });

    expect(selectedChipCache[KILZI_CHAT_ID]).toEqual({
      T1: 'EXTRA_DRS',
    });

    expect(userCache[String(KILZI_CHAT_ID)]).toMatchObject({
      selectedTeam: 'T2',
      bestTeamPointsWeights: {
        T1: 0.3,
        T2: 0.9,
      },
    });

    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
      'T1',
      currentTeamCache[KILZI_CHAT_ID].T1,
    );
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
      'T2',
      currentTeamCache[KILZI_CHAT_ID].T2,
    );

    expect(updateUserAttributes).toHaveBeenCalledWith(KILZI_CHAT_ID, {
      selectedTeam: 'T2',
      bestTeamPointsWeights: {
        T1: 0.3,
        T2: 0.9,
      },
    });
    expect(sendPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID, botMock);
  });


  it('should round-trip /print_cache output back into JSON input format', async () => {
    driversCache[KILZI_CHAT_ID] = {
      VER: { DR: 'VER', price: 30.5, expectedPriceChange: 1, expectedPoints: 20 },
      HAM: { DR: 'HAM', price: 25.0, expectedPriceChange: 2, expectedPoints: 18 },
    };
    constructorsCache[KILZI_CHAT_ID] = {
      RBR: { CN: 'RBR', price: 20.0, expectedPriceChange: 3, expectedPoints: 30 },
      MER: { CN: 'MER', price: 15.0, expectedPriceChange: 2, expectedPoints: 24 },
    };
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 4.5,
      },
      T2: {
        drivers: ['HAM', 'VER'],
        constructors: ['MER', 'RBR'],
        drsBoost: 'HAM',
        freeTransfers: 1,
        costCapRemaining: 2.5,
      },
    };
    selectedChipCache[KILZI_CHAT_ID] = {
      T2: 'WILDCARD',
    };
    userCache[String(KILZI_CHAT_ID)] = {
      selectedTeam: 'T2',
      bestTeamPointsWeights: { T1: 0.2, T2: 0.8 },
    };

    const printable = getPrintableCache(KILZI_CHAT_ID);
    const parsedPayload = JSON.parse(
      printable.replace(/```json\n/, '').replace(/\n```/, ''),
    );

    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
    delete userCache[String(KILZI_CHAT_ID)];

    await handleJsonMessage(botMock, KILZI_CHAT_ID, parsedPayload);

    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual({
      T1: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 4.5,
      },
      T2: {
        drivers: ['HAM', 'VER'],
        constructors: ['MER', 'RBR'],
        drsBoost: 'HAM',
        freeTransfers: 1,
        costCapRemaining: 2.5,
      },
    });
    expect(selectedChipCache[KILZI_CHAT_ID]).toEqual({ T2: 'WILDCARD' });
    expect(userCache[String(KILZI_CHAT_ID)]).toMatchObject({
      selectedTeam: 'T2',
      bestTeamPointsWeights: { T1: 0.2, T2: 0.8 },
    });
  });
});
