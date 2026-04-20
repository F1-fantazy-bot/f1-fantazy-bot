const mockGetSecret = jest.fn();

jest.mock('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({
    getSecret: mockGetSecret,
  })),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));

const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');
const keyVaultService = require('./keyVaultService');

describe('keyVaultService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      AZURE_KEY_VAULT_URL: 'https://example-kv.vault.azure.net/',
    };
    mockGetSecret.mockReset();
    SecretClient.mockClear();
    DefaultAzureCredential.mockClear();
    keyVaultService._resetForTests();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fetches a secret from Key Vault and returns its value', async () => {
    mockGetSecret.mockResolvedValueOnce({ value: 'my-secret-value' });

    const value = await keyVaultService.getSecret('some-secret');

    expect(value).toBe('my-secret-value');
    expect(mockGetSecret).toHaveBeenCalledWith('some-secret');
    expect(SecretClient).toHaveBeenCalledWith(
      'https://example-kv.vault.azure.net/',
      expect.anything()
    );
  });

  it('caches secrets across calls and hits KV only once', async () => {
    mockGetSecret.mockResolvedValueOnce({ value: 'cached-value' });

    const a = await keyVaultService.getSecret('same-secret');
    const b = await keyVaultService.getSecret('same-secret');

    expect(a).toBe('cached-value');
    expect(b).toBe('cached-value');
    expect(mockGetSecret).toHaveBeenCalledTimes(1);
  });

  it('refetches when forceRefresh is true', async () => {
    mockGetSecret
      .mockResolvedValueOnce({ value: 'v1' })
      .mockResolvedValueOnce({ value: 'v2' });

    const first = await keyVaultService.getSecret('rot');
    const second = await keyVaultService.getSecret('rot', { forceRefresh: true });

    expect(first).toBe('v1');
    expect(second).toBe('v2');
    expect(mockGetSecret).toHaveBeenCalledTimes(2);
  });

  it('throws if AZURE_KEY_VAULT_URL is not set', async () => {
    delete process.env.AZURE_KEY_VAULT_URL;

    await expect(keyVaultService.getSecret('anything')).rejects.toThrow(
      /AZURE_KEY_VAULT_URL/
    );
  });

  it('propagates errors thrown by the Key Vault client', async () => {
    mockGetSecret.mockRejectedValueOnce(new Error('Forbidden'));

    await expect(keyVaultService.getSecret('boom')).rejects.toThrow('Forbidden');
  });

  it('exports the scraper runner URL secret name', () => {
    expect(keyVaultService.SCRAPER_RUNNER_URL_SECRET).toBe(
      'f1-fantasy-scraper-runner-url'
    );
  });
});
