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
  resolveCommand: jest.fn((commandId, chatId, data) => ({
    handler: jest.fn(),
    validate: jest.fn(),
    resendPromptIfNotValid: `prompt-${commandId}-${chatId}`,
    data,
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
          data: '',
          createdAt: expect.any(String),
        }),
      );
    });

    it('should store data as JSON string when provided', async () => {
      await registerPendingReply(123, 'send_message_to_user', { step: 'collect_user_id' });

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'PendingReply',
          rowKey: '123',
          commandId: 'send_message_to_user',
          data: JSON.stringify({ step: 'collect_user_id' }),
          createdAt: expect.any(String),
        }),
      );
    });

    it('should store empty string for data when not provided', async () => {
      await registerPendingReply(123, 'report_bug');

      expect(mockUpsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          data: '',
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
    it('should resolve the command via the registry with null data when no data stored', async () => {
      mockGetEntity.mockResolvedValue({
        partitionKey: 'PendingReply',
        rowKey: '123',
        commandId: 'report_bug',
        data: '',
        createdAt: new Date().toISOString(),
      });

      const entry = await getPendingReply(123);

      expect(resolveCommand).toHaveBeenCalledWith('report_bug', 123, null);
      expect(entry).toBeDefined();
      expect(entry.handler).toBeDefined();
      expect(entry.validate).toBeDefined();
      expect(entry.resendPromptIfNotValid).toBe('prompt-report_bug-123');
    });

    it('should parse and forward stored data to resolveCommand', async () => {
      const storedData = { step: 'collect_message', targetChatId: '456' };
      mockGetEntity.mockResolvedValue({
        partitionKey: 'PendingReply',
        rowKey: '123',
        commandId: 'send_message_to_user',
        data: JSON.stringify(storedData),
        createdAt: new Date().toISOString(),
      });

      const entry = await getPendingReply(123);

      expect(resolveCommand).toHaveBeenCalledWith('send_message_to_user', 123, storedData);
      expect(entry).toBeDefined();
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
