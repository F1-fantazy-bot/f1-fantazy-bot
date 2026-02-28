const mockGetEntity = jest.fn();
const mockUpsertEntity = jest.fn();
const mockCreateTable = jest.fn().mockResolvedValue();
const mockListEntities = jest.fn();

jest.mock('@azure/data-tables', () => ({
  TableClient: {
    fromConnectionString: jest.fn().mockReturnValue({
      getEntity: mockGetEntity,
      upsertEntity: mockUpsertEntity,
      createTable: mockCreateTable,
      listEntities: mockListEntities,
    }),
  },
}));

describe('userRegistryService', () => {
  const originalEnv = process.env;

  let userRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEntity.mockReset();
    mockUpsertEntity.mockReset();
    mockCreateTable.mockReset().mockResolvedValue();
    mockListEntities.mockReset();

    process.env = {
      ...originalEnv,
      AZURE_STORAGE_CONNECTION_STRING: 'mock-connection-string',
    };

    jest.isolateModules(() => {
      userRegistryService = require('./userRegistryService');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('upsertUser', () => {
    it('should create new user with firstSeen and lastSeen', async () => {
      mockGetEntity.mockRejectedValueOnce(new Error('Not found'));
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.upsertUser(12345, 'TestUser');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'User',
          rowKey: '12345',
          chatName: 'TestUser',
          firstSeen: expect.any(String),
          lastSeen: expect.any(String),
        }),
      );

      // firstSeen and lastSeen should be the same for new users
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.firstSeen).toBe(entity.lastSeen);
    });

    it('should preserve firstSeen when user already exists', async () => {
      const originalFirstSeen = '2025-01-01T00:00:00.000Z';
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'OldName',
        firstSeen: originalFirstSeen,
        lastSeen: '2025-06-01T00:00:00.000Z',
      });
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.upsertUser(12345, 'NewName');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'User',
          rowKey: '12345',
          chatName: 'NewName',
          firstSeen: originalFirstSeen,
          lastSeen: expect.any(String),
        }),
      );

      // firstSeen should be preserved, lastSeen should be different
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.firstSeen).toBe(originalFirstSeen);
      expect(entity.lastSeen).not.toBe(originalFirstSeen);
    });

    it('should swallow errors silently', async () => {
      mockGetEntity.mockRejectedValueOnce(new Error('Not found'));
      mockUpsertEntity.mockRejectedValueOnce(new Error('Storage error'));

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Should not throw
      await userRegistryService.upsertUser(12345, 'TestUser');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error upserting user in registry:',
        'Storage error',
      );

      consoleSpy.mockRestore();
    });
  });

  describe('listAllUsers', () => {
    it('should return all registered users', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '111',
          chatName: 'Alice',
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
        },
        {
          partitionKey: 'User',
          rowKey: '222',
          chatName: 'Bob',
          firstSeen: '2025-02-01T00:00:00.000Z',
          lastSeen: '2025-06-15T00:00:00.000Z',
        },
      ];

      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockEntities;
        },
      });

      const result = await userRegistryService.listAllUsers();

      expect(result).toEqual([
        {
          chatId: '111',
          chatName: 'Alice',
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
        },
        {
          chatId: '222',
          chatName: 'Bob',
          firstSeen: '2025-02-01T00:00:00.000Z',
          lastSeen: '2025-06-15T00:00:00.000Z',
        },
      ]);
    });

    it('should return empty array when no users exist', async () => {
      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          // empty
        },
      });

      const result = await userRegistryService.listAllUsers();

      expect(result).toEqual([]);
    });
  });
});
