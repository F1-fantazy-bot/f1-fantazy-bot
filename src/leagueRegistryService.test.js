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

describe('leagueRegistryService', () => {
  const originalEnv = process.env;
  let service;

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
      service = require('./leagueRegistryService');
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

  function makeAsyncIterator(items) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const item of items) {
          yield item;
        }
      },
    };
  }

  describe('addUserLeague', () => {
    it('upserts the entity in Merge mode with league name and registeredAt', async () => {
      mockUpsertEntity.mockResolvedValueOnce();

      await service.addUserLeague(123, 'ABC', 'Amba');

      expect(mockCreateTable).toHaveBeenCalledTimes(1);
      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: '123',
          rowKey: 'ABC',
          leagueName: 'Amba',
          registeredAt: expect.any(String),
        }),
        'Merge',
      );
    });
  });

  describe('removeUserLeague', () => {
    it('deletes the entity', async () => {
      mockDeleteEntity.mockResolvedValueOnce();

      await service.removeUserLeague(123, 'ABC');

      expect(mockDeleteEntity).toHaveBeenCalledWith('123', 'ABC');
    });

    it('ignores 404 errors', async () => {
      mockDeleteEntity.mockRejectedValueOnce(notFound());

      await expect(service.removeUserLeague(123, 'ABC')).resolves.toBeUndefined();
    });

    it('rethrows non-404 errors', async () => {
      mockDeleteEntity.mockRejectedValueOnce(new Error('boom'));

      await expect(service.removeUserLeague(123, 'ABC')).rejects.toThrow('boom');
    });
  });

  describe('listUserLeagues', () => {
    it('returns all leagues for a chatId with stored attributes', async () => {
      mockListEntities.mockReturnValueOnce(
        makeAsyncIterator([
          {
            partitionKey: '123',
            rowKey: 'ABC',
            leagueName: 'Amba',
            registeredAt: '2026-01-01T00:00:00Z',
            etag: 'x',
          },
          {
            partitionKey: '123',
            rowKey: 'XYZ',
            leagueName: 'Other',
            registeredAt: '2026-02-01T00:00:00Z',
          },
        ]),
      );

      const result = await service.listUserLeagues(123);

      expect(mockListEntities).toHaveBeenCalledWith({
        queryOptions: { filter: "PartitionKey eq '123'" },
      });
      expect(result).toEqual([
        {
          chatId: '123',
          leagueCode: 'ABC',
          leagueName: 'Amba',
          registeredAt: '2026-01-01T00:00:00Z',
        },
        {
          chatId: '123',
          leagueCode: 'XYZ',
          leagueName: 'Other',
          registeredAt: '2026-02-01T00:00:00Z',
        },
      ]);
    });

    it('returns empty array when user has no leagues', async () => {
      mockListEntities.mockReturnValueOnce(makeAsyncIterator([]));

      const result = await service.listUserLeagues(999);

      expect(result).toEqual([]);
    });
  });

  describe('getUserLeague', () => {
    it('returns league on hit', async () => {
      mockGetEntity.mockResolvedValueOnce({
        partitionKey: '123',
        rowKey: 'ABC',
        leagueName: 'Amba',
      });

      const result = await service.getUserLeague(123, 'ABC');

      expect(result).toEqual({
        chatId: '123',
        leagueCode: 'ABC',
        leagueName: 'Amba',
      });
    });

    it('returns null on 404', async () => {
      mockGetEntity.mockRejectedValueOnce(notFound());

      const result = await service.getUserLeague(123, 'ABC');

      expect(result).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      mockGetEntity.mockRejectedValueOnce(new Error('fail'));

      await expect(service.getUserLeague(123, 'ABC')).rejects.toThrow('fail');
    });
  });
});
