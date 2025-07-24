const mockDownload = jest.fn();
const mockUpload = jest.fn();
const mockDeleteIfExists = jest.fn();
const mockExists = jest.fn();
const mockListBlobsFlat = jest.fn();

// Mock the Azure Storage SDK
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn().mockReturnValue({
      getContainerClient: jest.fn().mockReturnValue({
        getBlockBlobClient: jest.fn().mockReturnValue({
          download: mockDownload,
          upload: mockUpload,
          deleteIfExists: mockDeleteIfExists,
          exists: mockExists,
        }),
        listBlobsFlat: mockListBlobsFlat,
      }),
    }),
  },
}));

describe('azureStorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockDownload.mockReset();
    mockUpload.mockReset();
    mockDeleteIfExists.mockReset();
    mockExists.mockReset();
    mockListBlobsFlat.mockReset();

    // Setup environment
    process.env = {
      ...originalEnv,
      AZURE_STORAGE_CONNECTION_STRING: 'mock-connection-string',
      AZURE_STORAGE_CONTAINER_NAME: 'mock-container',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockStream = (data) => ({
    on: jest.fn((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify(data)));
      }
      if (event === 'end') {
        callback();
      }

      // Return a new instance to prevent infinite recursion
      return {
        on: jest.fn().mockReturnThis(),
      };
    }),
  });

  // We need to require the service inside each test to ensure proper mock initialization
  let azureStorageService;
  beforeEach(() => {
    // Import the service after mocks are set up
    jest.isolateModules(() => {
      azureStorageService = require('./azureStorageService');
    });
  });

  describe('getFantasyData', () => {
    it('should fetch and parse fantasy data', async () => {
      const mockData = {
        SimulationName: 'Test Simulation',
        Drivers: [{ DR: 'VER' }],
        Constructors: [{ CN: 'RBR' }],
      };

      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockData),
      });

      const result = await azureStorageService.getFantasyData();
      expect(result).toEqual(mockData);
      expect(mockDownload).toHaveBeenCalled();
    });

    it('should throw error if Azure config is missing', async () => {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
      jest.resetModules();
      const azureService = require('./azureStorageService');

      await expect(azureService.getFantasyData()).rejects.toThrow(
        'Missing required Azure storage configuration'
      );
    });
  });

  describe('getUserTeam', () => {
    const chatId = '123456';

    it('should return null if team does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);

      const result = await azureStorageService.getUserTeam(chatId);
      expect(result).toBeNull();
      expect(mockExists).toHaveBeenCalled();
    });

    it('should fetch and parse user team data', async () => {
      const mockTeam = {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
      };

      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockTeam),
      });

      const result = await azureStorageService.getUserTeam(chatId);
      expect(result).toEqual(mockTeam);
    });
  });

  describe('saveUserTeam', () => {
    const chatId = '123456';
    const teamData = {
      drivers: ['VER', 'HAM'],
      constructors: ['RBR', 'MER'],
    };

    it('should save user team data', async () => {
      mockUpload.mockResolvedValueOnce(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.saveUserTeam(mockBot, chatId, teamData);

      expect(mockUpload).toHaveBeenCalledWith(
        JSON.stringify(teamData, null, 2),
        expect.any(Number),
        expect.any(Object)
      );
    });
  });

  describe('deleteUserTeam', () => {
    const chatId = '123456';

    it('should delete user team data', async () => {
      mockDeleteIfExists.mockResolvedValueOnce(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.deleteUserTeam(mockBot, chatId);
      expect(mockDeleteIfExists).toHaveBeenCalled();
    });
  });

  describe('listAllUserTeamData', () => {
    it('should list and fetch all user teams', async () => {
      const mockBlobs = [
        { name: 'user-teams/123.json' },
        { name: 'user-teams/456.json' },
      ];

      const mockTeam1 = {
        drivers: ['VER'],
        constructors: ['RBR'],
      };

      const mockTeam2 = {
        drivers: ['HAM'],
        constructors: ['MER'],
      };

      mockListBlobsFlat.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockBlobs;
        },
      });

      mockExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      mockDownload
        .mockResolvedValueOnce({
          readableStreamBody: createMockStream(mockTeam1),
        })
        .mockResolvedValueOnce({
          readableStreamBody: createMockStream(mockTeam2),
        });

      const result = await azureStorageService.listAllUserTeamData();

      expect(result).toEqual({
        123: mockTeam1,
        456: mockTeam2,
      });
    });
  });

  describe('getUserSettings', () => {
    const chatId = '987654';

    it('should return null if settings do not exist', async () => {
      mockExists.mockResolvedValueOnce(false);

      const result = await azureStorageService.getUserSettings(chatId);
      expect(result).toBeNull();
    });

    it('should fetch and parse user settings data', async () => {
      const mockSettings = { lang: 'he' };

      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockSettings),
      });

      const result = await azureStorageService.getUserSettings(chatId);
      expect(result).toEqual(mockSettings);
    });
  });

  describe('saveUserSettings', () => {
    const chatId = '987654';
    const settingsData = { lang: 'he' };

    it('should save user settings data', async () => {
      mockUpload.mockResolvedValueOnce(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.saveUserSettings(mockBot, chatId, settingsData);

      expect(mockUpload).toHaveBeenCalledWith(
        JSON.stringify(settingsData, null, 2),
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should merge existing settings when saving', async () => {
      const existing = { timezone: 'utc' };
      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(existing),
      });
      mockUpload.mockResolvedValueOnce(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.saveUserSettings(mockBot, chatId, settingsData);

      expect(mockUpload).toHaveBeenCalledWith(
        JSON.stringify({ timezone: 'utc', lang: 'he' }, null, 2),
        expect.any(Number),
        expect.any(Object)
      );
    });
  });

  describe('listAllUserSettingsData', () => {
    it('should list and fetch all user settings', async () => {
      const mockBlobs = [
        { name: 'user-settings/111.json' },
        { name: 'user-settings/222.json' },
      ];

      const settings1 = { lang: 'en' };
      const settings2 = { lang: 'he' };

      mockListBlobsFlat.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockBlobs;
        },
      });

      mockExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      mockDownload
        .mockResolvedValueOnce({
          readableStreamBody: createMockStream(settings1),
        })
        .mockResolvedValueOnce({
          readableStreamBody: createMockStream(settings2),
        });

      const result = await azureStorageService.listAllUserSettingsData();

      expect(result).toEqual({
        111: settings1,
        222: settings2,
      });
    });
  });
});
