const mockCreateTable = jest.fn().mockResolvedValue();
const mockUpsertEntity = jest.fn().mockResolvedValue();
const mockGetEntity = jest.fn();
const mockDeleteEntity = jest.fn().mockResolvedValue();

jest.mock('@azure/data-tables', () => ({
  TableClient: {
    fromConnectionString: jest.fn(() => ({
      createTable: mockCreateTable,
      upsertEntity: mockUpsertEntity,
      getEntity: mockGetEntity,
      deleteEntity: mockDeleteEntity,
    })),
  },
}));

jest.mock('./pendingReplyRegistry', () => ({
  resolveCommand: jest.fn((commandId, chatId) => ({
    handler: jest.fn(),
    validate: jest.fn(),
    resendPromptIfNotValid: `prompt-${commandId}-${chatId}`,
  })),
}));

const {
  registerPendingReply,
  getPendingReply,
  clearPendingReply,
} = require('./pendingReplyManager');
const { resolveCommand } = require('./pendingReplyRegistry');

describe('pendingReplyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test';
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
  });

  describe('registerPendingReply', () => {
    it('should upsert an entity with command ID to Azure Table Storage', async () => {
      await registerPendingReply(123, 'report_bug');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'PendingReply',
          rowKey: '123',
          commandId: 'report_bug',
          createdAt: expect.any(String),
        }),
      );
    });

    it('should only call createTable once across multiple operations', async () => {
      // createTable may have been called by earlier tests (module-level tableReady flag),
      // so we track the count before and after
      const callsBefore = mockCreateTable.mock.calls.length;

      await registerPendingReply(123, 'report_bug');
      await registerPendingReply(456, 'report_bug');

      // At most 1 new createTable call (if tableReady wasn't already set)
      const newCalls = mockCreateTable.mock.calls.length - callsBefore;

      expect(newCalls).toBeLessThanOrEqual(1);
    });
  });

  describe('getPendingReply', () => {
    it('should resolve the command via the registry', async () => {
      mockGetEntity.mockResolvedValue({
        partitionKey: 'PendingReply',
        rowKey: '123',
        commandId: 'report_bug',
        createdAt: new Date().toISOString(),
      });

      const entry = await getPendingReply(123);

      expect(resolveCommand).toHaveBeenCalledWith('report_bug', 123);
      expect(entry).toBeDefined();
      expect(entry.handler).toBeDefined();
      expect(entry.validate).toBeDefined();
      expect(entry.resendPromptIfNotValid).toBe('prompt-report_bug-123');
    });

    it('should return undefined for unknown chat ids', async () => {
      mockGetEntity.mockRejectedValue(new Error('Not found'));

      const result = await getPendingReply(999);

      expect(result).toBeUndefined();
    });

    it('should return undefined and delete entity when expired', async () => {
      const expiredDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockGetEntity.mockResolvedValue({
        partitionKey: 'PendingReply',
        rowKey: '123',
        commandId: 'report_bug',
        createdAt: expiredDate,
      });

      const result = await getPendingReply(123);

      expect(result).toBeUndefined();
      expect(mockDeleteEntity).toHaveBeenCalledWith('PendingReply', '123');
    });
  });

  describe('clearPendingReply', () => {
    it('should delete the entity from table storage', async () => {
      await clearPendingReply(123);

      expect(mockDeleteEntity).toHaveBeenCalledWith('PendingReply', '123');
    });

    it('should not throw for unknown chat ids', async () => {
      mockDeleteEntity.mockRejectedValue(new Error('Not found'));

      await expect(clearPendingReply(999)).resolves.not.toThrow();
    });
  });
});
