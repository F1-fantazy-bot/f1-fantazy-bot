const { KILZI_CHAT_ID } = require('../constants');

const mockValidateJsonData = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  validateJsonData: mockValidateJsonData,
}));

const azureStorageService = require('../azureStorageService');
jest.mock('../azureStorageService', () => ({
  saveUserTeam: jest.fn().mockResolvedValue(undefined),
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
} = require('../cache');

const { handleJsonMessage } = require('./jsonInputHandler');

describe('handleJsonMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateJsonData.mockReset();
    mockValidateJsonData.mockReturnValue(true);
    azureStorageService.saveUserTeam.mockClear();
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete bestTeamsCache[KILZI_CHAT_ID];
  });


  it('should return early if validation fails', async () => {
    mockValidateJsonData.mockReturnValue(false);

    const jsonData = {
      Drivers: [],
      Constructors: [],
      CurrentTeam: {},
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    expect(mockValidateJsonData).toHaveBeenCalledWith(
      botMock,
      jsonData,
      KILZI_CHAT_ID
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
      KILZI_CHAT_ID
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

    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual(jsonData.CurrentTeam);

    // Verify bestTeamsCache was cleared
    expect(bestTeamsCache[KILZI_CHAT_ID]).toBeUndefined();

    // Verify team was saved to Azure Storage
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
      jsonData.CurrentTeam
    );

    // Verify printable cache was sent
    expect(sendPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID, botMock);
  });
});
