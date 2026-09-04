const mockGetToken = jest.fn();
const mockAcquireManualTriggerLease = jest.fn();
const mockMarkManualTriggerLease = jest.fn();
const mockReleaseManualTriggerLease = jest.fn();

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(() => ({
    getToken: mockGetToken,
  })),
}));

jest.mock('./services/manualTriggerLeaseService', () => ({
  acquireManualTriggerLease: mockAcquireManualTriggerLease,
  markManualTriggerLease: mockMarkManualTriggerLease,
  releaseManualTriggerLease: mockReleaseManualTriggerLease,
}));

const { DefaultAzureCredential } = require('@azure/identity');
const {
  MANUAL_TRIGGERS,
  triggerManualJob,
} = require('./manualTriggerService');

function mockResponse({ ok = true, status = 200, body = {}, text } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(text || JSON.stringify(body)),
  };
}

describe('manualTriggerService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_SUBSCRIPTION_ID: 'sub-123',
    };
    delete process.env.AZURE_RESOURCE_GROUP;
    global.fetch = jest.fn();
    mockGetToken.mockResolvedValue({ token: 'token-123' });
    mockAcquireManualTriggerLease.mockImplementation((triggerId) =>
      Promise.resolve({
        status: 'acquired',
        lease: {
          triggerId,
          owner: 'owner-1',
          runReference: `${triggerId}-run-1`,
          expiresAt: '2026-09-04T12:00:00.000Z',
        },
      }),
    );
    mockMarkManualTriggerLease.mockResolvedValue(true);
    mockReleaseManualTriggerLease.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('triggers callback-mode Logic Apps through listCallbackUrl', async () => {
    global.fetch
      .mockResolvedValueOnce(
        mockResponse({ body: { value: 'https://callback.example/run' } }),
      )
      .mockResolvedValueOnce(mockResponse());

    const result = await triggerManualJob('api_data');

    expect(result).toMatchObject({
      success: true,
      triggerId: 'api_data',
      runReference: 'api_data-run-1',
    });
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(mockGetToken).toHaveBeenCalledWith(
      'https://management.azure.com/.default',
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '/workflows/f1-fantasy-api-data-runner/triggers/manual/listCallbackUrl?api-version=2019-05-01',
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://callback.example/run',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
  });

  it('runs scheduler-mode Logic App triggers through Azure Management API', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ status: 202 }));

    const result = await triggerManualJob('next_race_info');

    expect(result).toMatchObject({
      success: true,
      triggerId: 'next_race_info',
      runReference: 'next_race_info-run-1',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/workflows/f1-fantasy-next-race-info-scheduler/triggers/Every_Monday/run?api-version=2019-05-01',
      ),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('uses AZURE_RESOURCE_GROUP when provided', async () => {
    process.env.AZURE_RESOURCE_GROUP = 'custom-rg';
    global.fetch
      .mockResolvedValueOnce(
        mockResponse({ body: { value: 'https://callback.example/run' } }),
      )
      .mockResolvedValueOnce(mockResponse());

    await triggerManualJob('scraper');

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/resourceGroups/custom-rg/'),
      expect.any(Object),
    );
  });

  it('returns an error for missing subscription configuration', async () => {
    delete process.env.AZURE_SUBSCRIPTION_ID;

    const result = await triggerManualJob('api_data');

    expect(result).toMatchObject({
      success: false,
      error: 'Missing required Azure configuration: AZURE_SUBSCRIPTION_ID',
    });
    expect(mockReleaseManualTriggerLease).toHaveBeenCalled();
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an error for unknown trigger IDs', async () => {
    const result = await triggerManualJob('missing');

    expect(result).toEqual({
      success: false,
      error: 'Unknown manual trigger: missing',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns management API failures', async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 403,
        text: 'Forbidden',
      }),
    );

    const result = await triggerManualJob('live_score_scheduler');

    expect(result).toMatchObject({
      success: false,
      uncertain: true,
      error: 'Azure Management API failed (403): Forbidden',
    });
    expect(mockReleaseManualTriggerLease).not.toHaveBeenCalled();
  });

  it('returns callback invocation failures', async () => {
    global.fetch
      .mockResolvedValueOnce(
        mockResponse({ body: { value: 'https://callback.example/run' } }),
      )
      .mockResolvedValueOnce(
        mockResponse({ ok: false, status: 500, text: 'Boom' }),
      );

    const result = await triggerManualJob('api_data_locked');

    expect(result).toMatchObject({
      success: false,
      uncertain: true,
      error: 'Logic App callback failed (500): Boom',
    });
  });

  it('does not contact Azure when the same job has an active durable lease', async () => {
    mockAcquireManualTriggerLease.mockResolvedValue({
      status: 'deduplicated',
      lease: {
        triggerId: 'api_data',
        owner: 'other-worker',
        runReference: 'api_data-existing',
        expiresAt: '2026-09-04T12:05:00.000Z',
      },
    });

    await expect(triggerManualJob('api_data')).resolves.toMatchObject({
      success: false,
      deduplicated: true,
      runReference: 'api_data-existing',
    });
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('exports the configured trigger registry', () => {
    expect(Object.keys(MANUAL_TRIGGERS)).toEqual([
      'scraper',
      'api_data',
      'api_data_locked',
      'next_race_info',
      'live_score_scheduler',
    ]);
  });
});
