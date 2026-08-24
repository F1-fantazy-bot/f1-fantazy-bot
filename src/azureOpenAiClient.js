const { AzureOpenAI } = require('openai');

const API_VERSION = '2024-04-01-preview';
let client;

/**
 * Return the process-wide Azure OpenAI client. Creation is lazy so modules can
 * be loaded by tooling and tests without requiring Azure credentials upfront.
 */
function getAzureOpenAiClient() {
  if (!client) {
    client = new AzureOpenAI({
      AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
      AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
      AZURE_OPEN_AI_MODEL: process.env.AZURE_OPEN_AI_MODEL,
      apiVersion: API_VERSION,
    });
  }

  return client;
}

module.exports = { getAzureOpenAiClient };
