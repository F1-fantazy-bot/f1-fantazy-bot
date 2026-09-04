const {
  acquireManualTriggerLease,
  markManualTriggerLease,
  releaseManualTriggerLease,
  setTableClientForTests,
  resetForTests,
} = require('./manualTriggerLeaseService');

function conflict(statusCode = 409) {
  const error = new Error('conflict');
  error.statusCode = statusCode;

  return error;
}

afterEach(() => {
  resetForTests();
});

test('creates one durable job-scoped lease with a safe run reference', async () => {
  const client = { createEntity: jest.fn().mockResolvedValue(undefined) };
  setTableClientForTests(client);

  const result = await acquireManualTriggerLease('api_data');

  expect(result).toMatchObject({
    status: 'acquired',
    lease: { triggerId: 'api_data', runReference: expect.stringMatching(/^api_data-/) },
  });
  expect(client.createEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      partitionKey: 'ManualTrigger',
      rowKey: 'api_data',
      owner: expect.any(String),
      expiresAt: expect.any(String),
    }),
  );
});

test('deduplicates an active job without replacing its public run reference', async () => {
  const client = {
    createEntity: jest.fn().mockRejectedValue(conflict()),
    getEntity: jest.fn().mockResolvedValue({
      rowKey: 'api_data',
      owner: 'other-worker',
      runReference: 'api_data-existing',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  };
  setTableClientForTests(client);

  await expect(acquireManualTriggerLease('api_data')).resolves.toEqual({
    status: 'deduplicated',
    lease: {
      triggerId: 'api_data',
      owner: 'other-worker',
      runReference: 'api_data-existing',
      expiresAt: expect.any(String),
    },
  });
  expect(client.updateEntity).toBeUndefined();
});

test('takes over an expired job lease with ETag protection', async () => {
  const client = {
    createEntity: jest.fn().mockRejectedValue(conflict()),
    getEntity: jest.fn().mockResolvedValue({
      rowKey: 'scraper',
      owner: 'old-worker',
      runReference: 'scraper-old',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      etag: 'etag-old',
    }),
    updateEntity: jest.fn().mockResolvedValue(undefined),
  };
  setTableClientForTests(client);

  const result = await acquireManualTriggerLease('scraper');

  expect(result.status).toBe('acquired');
  expect(client.updateEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      rowKey: 'scraper',
      owner: expect.not.stringMatching('old-worker'),
    }),
    'Replace',
    { etag: 'etag-old' },
  );
});

test('settles and releases only a lease owned by this run', async () => {
  const lease = {
    triggerId: 'api_data_locked',
    owner: 'owner-1',
    runReference: 'api_data_locked-123',
  };
  const client = {
    getEntity: jest.fn().mockResolvedValue({ owner: 'owner-1', etag: 'etag-1' }),
    updateEntity: jest.fn().mockResolvedValue(undefined),
    deleteEntity: jest.fn().mockResolvedValue(undefined),
  };
  setTableClientForTests(client);

  await expect(markManualTriggerLease(lease, 'triggered')).resolves.toBe(true);
  await expect(releaseManualTriggerLease(lease)).resolves.toBe(true);
  expect(client.updateEntity).toHaveBeenCalledWith(
    expect.objectContaining({ state: 'triggered' }),
    'Merge',
    { etag: 'etag-1' },
  );
  expect(client.deleteEntity).toHaveBeenCalledWith(
    'ManualTrigger',
    'api_data_locked',
    { etag: 'etag-1' },
  );
});

test('does not settle or release a lease replaced by another worker', async () => {
  const lease = {
    triggerId: 'live_score_scheduler',
    owner: 'owner-1',
    runReference: 'live_score_scheduler-123',
  };
  const client = {
    getEntity: jest.fn().mockResolvedValue({ owner: 'owner-2', etag: 'etag-2' }),
    updateEntity: jest.fn(),
    deleteEntity: jest.fn(),
  };
  setTableClientForTests(client);

  await expect(markManualTriggerLease(lease, 'triggered')).resolves.toBe(false);
  await expect(releaseManualTriggerLease(lease)).resolves.toBe(false);
  expect(client.updateEntity).not.toHaveBeenCalled();
  expect(client.deleteEntity).not.toHaveBeenCalled();
});
