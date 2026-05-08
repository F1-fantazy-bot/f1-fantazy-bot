const mockGetToken = jest.fn();

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(() => ({
    getToken: mockGetToken,
  })),
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
    process.env = {
      ...originalEnv,
      AZURE_SUBSCRIPTION_ID: 'sub-123',
    };
    delete process.env.AZURE_RESOURCE_GROUP;
    global.fetch = jest.fn();
    mockGetToken.mockResolvedValue({ token: 'token-123' });
    DefaultAzureCredential.mockClear();
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

    expect(result).toEqual({ success: true });
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

    expect(result).toEqual({ success: true });
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

    expect(result).toEqual({
      success: false,
      error: 'Missing required Azure configuration: AZURE_SUBSCRIPTION_ID',
    });
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

    expect(result).toEqual({
      success: false,
      error: 'Azure Management API failed (403): Forbidden',
    });
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

    expect(result).toEqual({
      success: false,
      error: 'Logic App callback failed (500): Boom',
    });
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
