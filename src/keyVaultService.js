const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const SCRAPER_RUNNER_URL_SECRET = 'f1-fantasy-scraper-runner-url';

let secretClient;
const secretCache = new Map();

function getSecretClient() {
  if (secretClient) {
    return secretClient;
  }

  const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
  if (!vaultUrl) {
    throw new Error(
      'Missing required Azure configuration: AZURE_KEY_VAULT_URL',
    );
  }

  const credential = new DefaultAzureCredential();
  secretClient = new SecretClient(vaultUrl, credential);

  return secretClient;
}

/**
 * Fetch a secret from the configured Azure Key Vault. Values are cached
 * for the lifetime of the Node process to avoid hitting KV on every call.
 * To force a refresh (e.g. after rotation) pass { forceRefresh: true }.
 *
 * @param {string} secretName
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<string>}
 */
async function getSecret(secretName, { forceRefresh = false } = {}) {
  if (!forceRefresh && secretCache.has(secretName)) {
    return secretCache.get(secretName);
  }

  const client = getSecretClient();
  const secret = await client.getSecret(secretName);
  secretCache.set(secretName, secret.value);

  return secret.value;
}

function _resetForTests() {
  secretClient = undefined;
  secretCache.clear();
}

module.exports = {
  getSecret,
  SCRAPER_RUNNER_URL_SECRET,
  _resetForTests,
};
