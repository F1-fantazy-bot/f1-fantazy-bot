jest.mock('openai', () => ({
  AzureOpenAI: jest.fn(() => ({ chat: { completions: {} } })),
}));

const { AzureOpenAI } = require('openai');
const { getAzureOpenAiClient } = require('./azureOpenAiClient');

describe('azureOpenAiClient', () => {
  it('lazily creates and reuses one client for the process', () => {
    expect(AzureOpenAI).not.toHaveBeenCalled();

    const first = getAzureOpenAiClient();
    const second = getAzureOpenAiClient();

    expect(first).toBe(second);
    expect(AzureOpenAI).toHaveBeenCalledTimes(1);
    expect(AzureOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: '2024-04-01-preview' }),
    );
  });
});
