const {
  withUserMutationLock,
  acquireUserMutationLock,
  releaseUserMutationLock,
  setTableClientForTests,
  resetForTests,
} = require('./userMutationLockService');

function conflict(statusCode = 409) {
  const error = new Error('conflict');
  error.statusCode = statusCode;

  return error;
}

afterEach(() => {
  resetForTests();
  jest.restoreAllMocks();
});

test('acquires a new durable per-user lease', async () => {
  const client = {
    createEntity: jest.fn().mockResolvedValue(undefined),
  };
  setTableClientForTests(client);

  const lock = await acquireUserMutationLock(42);

  expect(client.createEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      partitionKey: 'User',
      rowKey: '42',
      owner: expect.any(String),
      expiresAt: expect.any(String),
    }),
  );
  expect(lock).toMatchObject({ client, chatId: 42 });
});

test('takes over an expired lease with ETag protection', async () => {
  const client = {
    createEntity: jest.fn().mockRejectedValue(conflict()),
    getEntity: jest.fn().mockResolvedValue({
      partitionKey: 'User',
      rowKey: '42',
      owner: 'old-owner',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      etag: 'etag-old',
    }),
    updateEntity: jest.fn().mockResolvedValue(undefined),
  };
  setTableClientForTests(client);

  await acquireUserMutationLock(42);

  expect(client.updateEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      rowKey: '42',
      owner: expect.not.stringMatching('old-owner'),
    }),
    'Replace',
    { etag: 'etag-old' },
  );
});

test('release deletes only the lease owned by this operation', async () => {
  const client = {
    getEntity: jest.fn().mockResolvedValue({
      owner: 'owner-1',
      etag: 'etag-1',
    }),
    deleteEntity: jest.fn().mockResolvedValue(undefined),
  };

  await expect(
    releaseUserMutationLock({
      client,
      chatId: 42,
      owner: 'owner-1',
    }),
  ).resolves.toBe(true);
  expect(client.deleteEntity).toHaveBeenCalledWith('User', '42', {
    etag: 'etag-1',
  });
});

test('release failure does not replace a committed operation result', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const client = {
    createEntity: jest.fn().mockResolvedValue(undefined),
    getEntity: jest.fn().mockRejectedValue(new Error('release unavailable')),
  };
  setTableClientForTests(client);
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(
    withUserMutationLock(42, async () => 'committed'),
  ).resolves.toBe('committed');
  expect(console.error).toHaveBeenCalledWith(
    'Failed to release user mutation lock for 42:',
    expect.any(Error),
  );

  process.env.NODE_ENV = originalNodeEnv;
});
