const mockGetEntity = jest.fn();
const mockUpsertEntity = jest.fn();
const mockDeleteEntity = jest.fn();
const mockCreateTable = jest.fn().mockResolvedValue();
const mockListEntities = jest.fn();

jest.mock('@azure/data-tables', () => ({
  TableClient: {
    fromConnectionString: jest.fn().mockReturnValue({
      getEntity: mockGetEntity,
      upsertEntity: mockUpsertEntity,
      deleteEntity: mockDeleteEntity,
      createTable: mockCreateTable,
      listEntities: mockListEntities,
    }),
  },
}));

describe('webUserAllowlistService', () => {
  const originalEnv = process.env;

  let svc;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEntity.mockReset();
    mockUpsertEntity.mockReset();
    mockDeleteEntity.mockReset();
    mockCreateTable.mockReset().mockResolvedValue();
    mockListEntities.mockReset();

    process.env = {
      ...originalEnv,
      AZURE_STORAGE_CONNECTION_STRING: 'mock-connection-string',
    };

    jest.isolateModules(() => {
      svc = require('./webUserAllowlistService');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function notFound() {
    const err = new Error('ResourceNotFound');
    err.statusCode = 404;

    return err;
  }

  describe('getAllowedUserByEmail', () => {
    it('returns user object on hit, normalizing email case', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'WebUser',
        rowKey: 'foo@example.com',
        chatId: '12345',
        addedBy: '454873194',
        addedAt: '2026-05-21T00:00:00.000Z',
      });

      const user = await svc.getAllowedUserByEmail('Foo@Example.COM');

      expect(mockGetEntity).toHaveBeenCalledWith('WebUser', 'foo@example.com');
      expect(user).toEqual({
        email: 'foo@example.com',
        chatId: '12345',
        addedBy: '454873194',
        addedAt: '2026-05-21T00:00:00.000Z',
      });
    });

    it('returns null on 404', async () => {
      mockGetEntity.mockRejectedValueOnce(notFound());

      const user = await svc.getAllowedUserByEmail('missing@example.com');

      expect(user).toBeNull();
    });

    it('re-throws non-404 errors', async () => {
      mockGetEntity.mockRejectedValueOnce(new Error('boom'));

      await expect(
        svc.getAllowedUserByEmail('foo@example.com'),
      ).rejects.toThrow('boom');
    });

    it('strips Azure system fields from the returned object', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: 'WebUser',
        rowKey: 'foo@example.com',
        etag: 'W/"datetime"',
        timestamp: '2026-05-21T00:00:00.000Z',
        chatId: '12345',
      });

      const user = await svc.getAllowedUserByEmail('foo@example.com');
      expect(user).toEqual({ email: 'foo@example.com', chatId: '12345' });
    });
  });

  describe('addAllowedUser', () => {
    it('writes the entity with Merge mode and stringifies chatId', async () => {
      mockUpsertEntity.mockResolvedValueOnce();

      await svc.addAllowedUser('Bar@Example.com', 67890, 454873194);

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'WebUser',
          rowKey: 'bar@example.com',
          chatId: '67890',
          addedBy: '454873194',
          addedAt: expect.any(String),
        }),
        'Merge',
      );
    });
  });

  describe('removeAllowedUser', () => {
    it('deletes the row', async () => {
      mockDeleteEntity.mockResolvedValueOnce();

      await svc.removeAllowedUser('foo@example.com');

      expect(mockDeleteEntity).toHaveBeenCalledWith(
        'WebUser',
        'foo@example.com',
      );
    });

    it('treats missing row as a no-op (404)', async () => {
      mockDeleteEntity.mockRejectedValueOnce(notFound());

      await expect(
        svc.removeAllowedUser('missing@example.com'),
      ).resolves.toBeUndefined();
    });

    it('re-throws on non-404 errors', async () => {
      mockDeleteEntity.mockRejectedValueOnce(new Error('boom'));

      await expect(svc.removeAllowedUser('foo@example.com')).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('listAllowedUsers', () => {
    it('returns all entries with email + non-system fields', async () => {
      mockListEntities.mockReturnValueOnce({
        async *[Symbol.asyncIterator]() {
          yield {
            partitionKey: 'WebUser',
            rowKey: 'a@example.com',
            etag: 'x',
            chatId: '1',
            addedBy: '100',
            addedAt: '2026-05-01T00:00:00.000Z',
          };
          yield {
            partitionKey: 'WebUser',
            rowKey: 'b@example.com',
            chatId: '2',
          };
        },
      });

      const users = await svc.listAllowedUsers();

      expect(users).toEqual([
        {
          email: 'a@example.com',
          chatId: '1',
          addedBy: '100',
          addedAt: '2026-05-01T00:00:00.000Z',
        },
        { email: 'b@example.com', chatId: '2' },
      ]);
    });
  });

  describe('initialization', () => {
    it('throws when AZURE_STORAGE_CONNECTION_STRING is missing', async () => {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;

      jest.isolateModules(() => {
        svc = require('./webUserAllowlistService');
      });

      await expect(
        svc.getAllowedUserByEmail('foo@example.com'),
      ).rejects.toThrow(/AZURE_STORAGE_CONNECTION_STRING/);
    });
  });
});
