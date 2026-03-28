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

  // Helper to create a 404 "not found" error like Azure Table Storage throws
  function createNotFoundError() {
    const err = new Error('ResourceNotFound');
    err.statusCode = 404;

    return err;
  }

  describe('upsertUser', () => {
    it('should create new user with firstSeen, lastSeen, and chatName using Merge mode', async () => {
      mockGetEntity.mockRejectedValueOnce(createNotFoundError());
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
        'Merge',
      );

      // firstSeen and lastSeen should be the same for new users
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.firstSeen).toBe(entity.lastSeen);
    });

    it('should not include firstSeen when user already exists (Merge preserves it)', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'OldName',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
      });
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.upsertUser(12345, 'NewName');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'User',
          rowKey: '12345',
          chatName: 'NewName',
          lastSeen: expect.any(String),
        }),
        'Merge',
      );

      // firstSeen should NOT be in the entity — Merge mode preserves it automatically
      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.firstSeen).toBeUndefined();
    });

    it('should not include lang or other attributes — Merge mode preserves them automatically', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'TestUser',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
        lang: 'he',
        someNewAttribute: 'value',
      });
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.upsertUser(12345, 'TestUser');

      const entity = mockUpsertEntity.mock.calls[0][0];
      // Only chatName and lastSeen should be sent — Merge preserves everything else
      expect(entity.lang).toBeUndefined();
      expect(entity.someNewAttribute).toBeUndefined();
      expect(entity.chatName).toBe('TestUser');
      expect(entity.lastSeen).toBeDefined();
    });

    it('should not include lang field when user is new', async () => {
      mockGetEntity.mockRejectedValueOnce(createNotFoundError());
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.upsertUser(12345, 'TestUser');

      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.lang).toBeUndefined();
    });

    it('should swallow errors silently when upsert fails', async () => {
      mockGetEntity.mockRejectedValueOnce(createNotFoundError());
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

    it('should swallow and log real getEntity errors (non-404)', async () => {
      const realError = new Error('Network timeout');
      realError.statusCode = 500;
      mockGetEntity.mockRejectedValueOnce(realError);

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Should not throw — outer catch swallows it
      await userRegistryService.upsertUser(12345, 'TestUser');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error upserting user in registry:',
        'Network timeout',
      );
      // upsertEntity should NOT have been called because the error was re-thrown
      expect(mockUpsertEntity).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('updateUserAttributes', () => {
    it('should update a single attribute using Merge mode', async () => {
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserAttributes(12345, { lang: 'he' });

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        {
          partitionKey: 'User',
          rowKey: '12345',
          lang: 'he',
        },
        'Merge',
      );
    });

    it('should update multiple attributes at once', async () => {
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserAttributes(12345, {
        lang: 'he',
        timezone: 'Asia/Jerusalem',
      });

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        {
          partitionKey: 'User',
          rowKey: '12345',
          lang: 'he',
          timezone: 'Asia/Jerusalem',
        },
        'Merge',
      );
    });

    it('should not require a read before writing (no getEntity call)', async () => {
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserAttributes(12345, { lang: 'en' });

      expect(mockGetEntity).not.toHaveBeenCalled();
      expect(mockUpsertEntity).toHaveBeenCalledTimes(1);
    });

    it('should throw on storage errors (not swallowed)', async () => {
      mockUpsertEntity.mockRejectedValueOnce(new Error('Storage error'));

      await expect(
        userRegistryService.updateUserAttributes(12345, { lang: 'he' }),
      ).rejects.toThrow('Storage error');
    });

    it('should accept string chatId', async () => {
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserAttributes('12345', { lang: 'en' });

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          rowKey: '12345',
        }),
        'Merge',
      );
    });

    it('should delete null-valued attributes using Replace mode', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'Alice',
        lang: 'he',
        selectedTeam: 'T1',
        selectedBestTeamByTeam: '{"T1":{"drivers":["VER"]}}',
      });
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserAttributes(12345, {
        selectedTeam: null,
        selectedBestTeamByTeam: null,
        lang: 'en',
      });

      expect(mockGetEntity).toHaveBeenCalledWith('User', '12345');
      expect(mockUpsertEntity).toHaveBeenCalledWith(
        {
          partitionKey: 'User',
          rowKey: '12345',
          chatName: 'Alice',
          lang: 'en',
        },
        'Replace',
      );
    });

    it('should still replace correctly when deleting attributes for a missing user', async () => {
      mockGetEntity.mockRejectedValueOnce(createNotFoundError());
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserAttributes(12345, {
        selectedTeam: null,
      });

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        {
          partitionKey: 'User',
          rowKey: '12345',
        },
        'Replace',
      );
    });
  });

  describe('getUserById', () => {
    it('should return user object when user exists', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '456',
        chatName: 'Target User',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
        lang: 'he',
      });

      const result = await userRegistryService.getUserById(456);

      expect(mockGetEntity).toHaveBeenCalledWith('User', '456');
      expect(result).toEqual({
        chatId: '456',
        chatName: 'Target User',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
        lang: 'he',
      });
    });

    it('should return null when user does not exist', async () => {
      mockGetEntity.mockRejectedValueOnce(createNotFoundError());

      const result = await userRegistryService.getUserById(999);

      expect(mockGetEntity).toHaveBeenCalledWith('User', '999');
      expect(result).toBeNull();
    });

    it('should accept string chatId', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '456',
        chatName: 'Target User',
      });

      const result = await userRegistryService.getUserById('456');

      expect(mockGetEntity).toHaveBeenCalledWith('User', '456');
      expect(result).toEqual({
        chatId: '456',
        chatName: 'Target User',
      });
    });

    it('should exclude Azure system fields from returned data', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '456',
        etag: 'some-etag',
        timestamp: '2025-01-01T00:00:00.000Z',
        chatName: 'Target User',
      });

      const result = await userRegistryService.getUserById(456);

      expect(result.partitionKey).toBeUndefined();
      expect(result.etag).toBeUndefined();
      expect(result.timestamp).toBeUndefined();
      expect(result.chatId).toBe('456');
      expect(result.chatName).toBe('Target User');
    });

    it('should throw on real storage errors (non-404)', async () => {
      const realError = new Error('Network timeout');
      realError.statusCode = 500;
      mockGetEntity.mockRejectedValueOnce(realError);

      await expect(
        userRegistryService.getUserById(456),
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('listAllUsers', () => {
    it('should return all registered users including lang', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '111',
          chatName: 'Alice',
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
          lang: 'en',
        },
        {
          partitionKey: 'User',
          rowKey: '222',
          chatName: 'Bob',
          firstSeen: '2025-02-01T00:00:00.000Z',
          lastSeen: '2025-06-15T00:00:00.000Z',
          lang: 'he',
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
          lang: 'en',
        },
        {
          chatId: '222',
          chatName: 'Bob',
          firstSeen: '2025-02-01T00:00:00.000Z',
          lastSeen: '2025-06-15T00:00:00.000Z',
          lang: 'he',
        },
      ]);
    });

    it('should return undefined lang when user has no language set', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '333',
          chatName: 'Charlie',
          firstSeen: '2025-03-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
        },
      ];

      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockEntities;
        },
      });

      const result = await userRegistryService.listAllUsers();

      expect(result[0].lang).toBeUndefined();
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

    it('should automatically include future/unknown attributes', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '444',
          chatName: 'Diana',
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
          lang: 'en',
          timezone: 'Asia/Jerusalem',
          notifications: true,
        },
      ];

      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockEntities;
        },
      });

      const result = await userRegistryService.listAllUsers();

      expect(result[0]).toEqual({
        chatId: '444',
        chatName: 'Diana',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
        lang: 'en',
        timezone: 'Asia/Jerusalem',
        notifications: true,
      });
    });

    it('should exclude Azure system fields from returned data', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '555',
          etag: 'some-etag',
          timestamp: '2025-01-01T00:00:00.000Z',
          chatName: 'Eve',
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
        },
      ];

      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockEntities;
        },
      });

      const result = await userRegistryService.listAllUsers();

      expect(result[0].partitionKey).toBeUndefined();
      expect(result[0].etag).toBeUndefined();
      expect(result[0].timestamp).toBeUndefined();
      expect(result[0].chatId).toBe('555');
      expect(result[0].chatName).toBe('Eve');
    });
  });
});
