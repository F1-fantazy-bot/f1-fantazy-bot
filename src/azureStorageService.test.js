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

jest.mock('./utils/utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  getDisplayName: jest.fn().mockReturnValue('Test User'),
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
        'Missing required Azure storage configuration',
      );
    });
  });

  describe('getLiveScoreData', () => {
    it('should fetch and parse live score data from the live-score container', async () => {
      const mockData = {
        extractedAt: '2026-03-27T11:07:54.562Z',
        drivers: { VER: { TotalPoints: 14, PriceChange: 0.1 } },
      };

      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockData),
      });

      const result = await azureStorageService.getLiveScoreData();
      expect(result).toEqual(mockData);
      expect(mockDownload).toHaveBeenCalled();
    });
  });

  describe('getUserTeam', () => {
    const chatId = '123456';
    const teamId = 'T1';

    it('should return null if team does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);

      const result = await azureStorageService.getUserTeam(chatId, teamId);
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

      const result = await azureStorageService.getUserTeam(chatId, teamId);
      expect(result).toEqual(mockTeam);
    });
  });

  describe('saveUserTeam', () => {
    const chatId = '123456';
    const teamId = 'T1';
    const teamData = {
      drivers: ['VER', 'HAM'],
      constructors: ['RBR', 'MER'],
    };

    it('should save user team data', async () => {
      mockUpload.mockResolvedValueOnce(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.saveUserTeam(mockBot, chatId, teamId, teamData);

      expect(mockUpload).toHaveBeenCalledWith(
        JSON.stringify(teamData, null, 2),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('logs a success message by default', async () => {
      mockUpload.mockResolvedValueOnce(undefined);
      const { sendLogMessage } = require('./utils/utils');
      sendLogMessage.mockClear();
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.saveUserTeam(mockBot, chatId, teamId, teamData);

      expect(sendLogMessage).toHaveBeenCalledTimes(1);
      expect(sendLogMessage).toHaveBeenCalledWith(
        mockBot,
        expect.stringContaining('Successfully saved team data'),
      );
    });

    it('suppresses the success log when silent: true', async () => {
      mockUpload.mockResolvedValueOnce(undefined);
      const { sendLogMessage } = require('./utils/utils');
      sendLogMessage.mockClear();
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.saveUserTeam(
        mockBot,
        chatId,
        teamId,
        teamData,
        { silent: true },
      );

      expect(mockUpload).toHaveBeenCalled();
      expect(sendLogMessage).not.toHaveBeenCalled();
    });
  });

  describe('deleteUserTeam', () => {
    const chatId = '123456';
    const teamId = 'T1';

    it('should delete user team data', async () => {
      mockDeleteIfExists.mockResolvedValueOnce(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.deleteUserTeam(mockBot, chatId, teamId);
      expect(mockDeleteIfExists).toHaveBeenCalled();
    });
  });

  describe('deleteAllUserTeams', () => {
    const chatId = '123456';

    it('should delete all team blobs for a user', async () => {
      const mockBlobs = [
        { name: `user-teams/${chatId}_T1.json` },
        { name: `user-teams/${chatId}_T2.json` },
      ];

      mockListBlobsFlat.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockBlobs;
        },
      });

      mockDeleteIfExists.mockResolvedValue(undefined);
      const mockBot = { sendMessage: jest.fn() };

      await azureStorageService.deleteAllUserTeams(mockBot, chatId);
      expect(mockDeleteIfExists).toHaveBeenCalledTimes(2);
    });
  });

  describe('listAllUserTeamData', () => {
    it('should list and fetch all user teams in nested format', async () => {
      const mockBlobs = [
        { name: 'user-teams/123_T1.json' },
        { name: 'user-teams/456_T2.json' },
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
        123: { T1: mockTeam1 },
        456: { T2: mockTeam2 },
      });
    });

    it('should group multiple teams under the same chatId', async () => {
      const mockBlobs = [
        { name: 'user-teams/123_T1.json' },
        { name: 'user-teams/123_T2.json' },
      ];

      const mockTeam1 = { drivers: ['VER'] };
      const mockTeam2 = { drivers: ['HAM'] };

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
        123: {
          T1: mockTeam1,
          T2: mockTeam2,
        },
      });
    });
  });

  describe('getLeagueData', () => {
    it('downloads and parses the league blob when it exists', async () => {
      const mockData = {
        leagueName: 'Amba',
        leagueCode: 'ABC',
        teams: [],
      };

      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockData),
      });

      const result = await azureStorageService.getLeagueData('ABC');

      expect(result).toEqual(mockData);
      expect(mockExists).toHaveBeenCalled();
    });

    it('returns null when the league blob does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);

      const result = await azureStorageService.getLeagueData('MISSING');

      expect(result).toBeNull();
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('wraps real errors', async () => {
      mockExists.mockRejectedValueOnce(new Error('boom'));

      await expect(
        azureStorageService.getLeagueData('ABC'),
      ).rejects.toThrow('Failed to get league data for ABC: boom');
    });
  });

  describe('getLeagueTeamsData', () => {
    it('downloads and parses the teams-data blob when it exists', async () => {
      const mockData = {
        leagueName: 'Amba',
        leagueCode: 'ABC',
        teams: [{ teamName: 'Racers', position: 1 }],
      };

      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockData),
      });

      const result = await azureStorageService.getLeagueTeamsData('ABC');

      expect(result).toEqual(mockData);
    });

    it('returns null when the teams-data blob does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);

      const result = await azureStorageService.getLeagueTeamsData('MISSING');

      expect(result).toBeNull();
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('wraps real errors', async () => {
      mockExists.mockRejectedValueOnce(new Error('boom'));

      await expect(
        azureStorageService.getLeagueTeamsData('ABC'),
      ).rejects.toThrow('Failed to get league teams data for ABC: boom');
    });
  });

  describe('listAllUserTeamData parser (underscore-safe)', () => {
    it('splits on the first underscore so teamIds may contain underscores', async () => {
      const mockBlobs = [
        { name: 'user-teams/123_ABC_Team-One.json' },
        { name: 'user-teams/123_T1.json' },
      ];

      const mockTeam1 = { drivers: ['VER'] };
      const mockTeam2 = { drivers: ['HAM'] };

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
        123: {
          'ABC_Team-One': mockTeam1,
          T1: mockTeam2,
        },
      });
    });
  });

  describe('listLockedMatchdays', () => {
    const yieldBlobs = (...names) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const name of names) {
          yield { name };
        }
      },
    });

    it('returns sorted numeric matchday IDs from the locked/ prefix', async () => {
      mockListBlobsFlat.mockReturnValueOnce(
        yieldBlobs(
          'leagues/ABC/locked/matchday_3.json',
          'leagues/ABC/locked/matchday_10.json',
          'leagues/ABC/locked/matchday_5.json',
        ),
      );

      const result = await azureStorageService.listLockedMatchdays('ABC');

      expect(result).toEqual([3, 5, 10]);
      expect(mockListBlobsFlat).toHaveBeenCalledWith({
        prefix: 'leagues/ABC/locked/',
      });
    });

    it('returns an empty array when no locked snapshots exist', async () => {
      mockListBlobsFlat.mockReturnValueOnce(yieldBlobs());

      const result = await azureStorageService.listLockedMatchdays('EMPTY');

      expect(result).toEqual([]);
    });

    it('ignores blobs that do not match the matchday_{N}.json pattern', async () => {
      mockListBlobsFlat.mockReturnValueOnce(
        yieldBlobs(
          'leagues/ABC/locked/matchday_4.json',
          'leagues/ABC/locked/notes.txt',
          'leagues/ABC/locked/matchday_4.json.bak',
          'leagues/ABC/locked/matchday_x.json',
        ),
      );

      const result = await azureStorageService.listLockedMatchdays('ABC');

      expect(result).toEqual([4]);
    });

    it('wraps real listing errors', async () => {
      mockListBlobsFlat.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await expect(
        azureStorageService.listLockedMatchdays('ABC'),
      ).rejects.toThrow('Failed to list locked matchdays for ABC: boom');
    });
  });

  describe('getLockedTeamsData', () => {
    const yieldBlobs = (...names) => ({
      [Symbol.asyncIterator]: async function* () {
        for (const name of names) {
          yield { name };
        }
      },
    });

    it('reads the explicit matchday blob when matchdayId is given', async () => {
      const mockData = { leagueCode: 'ABC', matchdayId: 5, teams: [] };

      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockData),
      });

      const result = await azureStorageService.getLockedTeamsData('ABC', 5);

      expect(result).toEqual(mockData);
      expect(mockListBlobsFlat).not.toHaveBeenCalled();
    });

    it('returns null when the explicit matchday blob does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);

      const result = await azureStorageService.getLockedTeamsData('ABC', 99);

      expect(result).toBeNull();
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('resolves the latest matchday when matchdayId is omitted', async () => {
      const mockData = { leagueCode: 'ABC', matchdayId: 7, teams: [] };

      mockListBlobsFlat.mockReturnValueOnce(
        yieldBlobs(
          'leagues/ABC/locked/matchday_3.json',
          'leagues/ABC/locked/matchday_7.json',
          'leagues/ABC/locked/matchday_5.json',
        ),
      );
      mockExists.mockResolvedValueOnce(true);
      mockDownload.mockResolvedValueOnce({
        readableStreamBody: createMockStream(mockData),
      });

      const result = await azureStorageService.getLockedTeamsData('ABC');

      expect(result).toEqual(mockData);
    });

    it('returns null when no locked snapshots exist and matchdayId is omitted', async () => {
      mockListBlobsFlat.mockReturnValueOnce(yieldBlobs());

      const result = await azureStorageService.getLockedTeamsData('EMPTY');

      expect(result).toBeNull();
      expect(mockExists).not.toHaveBeenCalled();
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('wraps real errors with the matchday label when one was provided', async () => {
      mockExists.mockRejectedValueOnce(new Error('boom'));

      await expect(
        azureStorageService.getLockedTeamsData('ABC', 4),
      ).rejects.toThrow('Failed to get locked teams data for ABC matchday 4: boom');
    });

    it('wraps real errors without a matchday label when none was provided', async () => {
      mockListBlobsFlat.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await expect(
        azureStorageService.getLockedTeamsData('ABC'),
      ).rejects.toThrow(
        // The inner listLockedMatchdays wraps first, then getLockedTeamsData wraps again
        'Failed to get locked teams data for ABC: Failed to list locked matchdays for ABC: boom',
      );
    });
  });
});
