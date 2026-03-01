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
    it('should create new user with firstSeen and lastSeen', async () => {
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

    it('should preserve lang when user already exists with a language', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'TestUser',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
        lang: 'he',
      });
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.upsertUser(12345, 'TestUser');

      const entity = mockUpsertEntity.mock.calls[0][0];
      expect(entity.lang).toBe('he');
    });

    it('should not include lang field when user has no language set', async () => {
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

  describe('updateUserLanguage', () => {
    it('should update language for existing user', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'TestUser',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
      });
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserLanguage(12345, 'he');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'User',
          rowKey: '12345',
          chatName: 'TestUser',
          firstSeen: '2025-01-01T00:00:00.000Z',
          lastSeen: '2025-06-01T00:00:00.000Z',
          lang: 'he',
        }),
      );
    });

    it('should create minimal entity if user does not exist (404)', async () => {
      mockGetEntity.mockRejectedValueOnce(createNotFoundError());
      mockUpsertEntity.mockResolvedValueOnce();

      await userRegistryService.updateUserLanguage(99999, 'en');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'User',
          rowKey: '99999',
          chatName: '',
          lang: 'en',
          firstSeen: expect.any(String),
          lastSeen: expect.any(String),
        }),
      );
    });

    it('should throw on storage errors (not swallowed)', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'User',
        rowKey: '12345',
        chatName: 'TestUser',
        firstSeen: '2025-01-01T00:00:00.000Z',
        lastSeen: '2025-06-01T00:00:00.000Z',
      });
      mockUpsertEntity.mockRejectedValueOnce(new Error('Storage error'));

      await expect(
        userRegistryService.updateUserLanguage(12345, 'he'),
      ).rejects.toThrow('Storage error');
    });

    it('should throw on real getEntity errors (non-404)', async () => {
      const realError = new Error('Auth failure');
      realError.statusCode = 403;
      mockGetEntity.mockRejectedValueOnce(realError);

      await expect(
        userRegistryService.updateUserLanguage(12345, 'he'),
      ).rejects.toThrow('Auth failure');
      // upsertEntity should NOT have been called
      expect(mockUpsertEntity).not.toHaveBeenCalled();
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
  });

  describe('listAllUserLanguages', () => {
    it('should return mapping of chatId to lang for users with language set', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '111',
          chatName: 'Alice',
          lang: 'en',
        },
        {
          partitionKey: 'User',
          rowKey: '222',
          chatName: 'Bob',
          lang: 'he',
        },
        {
          partitionKey: 'User',
          rowKey: '333',
          chatName: 'Charlie',
          // no lang
        },
      ];

      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockEntities;
        },
      });

      const result = await userRegistryService.listAllUserLanguages();

      expect(result).toEqual({
        111: 'en',
        222: 'he',
      });
    });

    it('should return empty object when no users have language set', async () => {
      const mockEntities = [
        {
          partitionKey: 'User',
          rowKey: '111',
          chatName: 'Alice',
        },
      ];

      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          yield* mockEntities;
        },
      });

      const result = await userRegistryService.listAllUserLanguages();

      expect(result).toEqual({});
    });

    it('should return empty object when no users exist', async () => {
      mockListEntities.mockReturnValueOnce({
        [Symbol.asyncIterator]: async function* () {
          // empty
        },
      });

      const result = await userRegistryService.listAllUserLanguages();

      expect(result).toEqual({});
    });
  });
});
