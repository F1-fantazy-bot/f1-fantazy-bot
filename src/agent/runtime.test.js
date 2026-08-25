const mockBuiltInAgent = jest.fn((config) => ({ config }));

jest.mock('@copilotkit/runtime/v2', () => ({
  CopilotRuntime: jest.fn(),
  BuiltInAgent: mockBuiltInAgent,
  createCopilotRuntimeHandler: jest.fn(),
}));

jest.mock('@ai-sdk/azure', () => ({
  createAzure: jest.fn(() => ({
    chat: jest.fn(() => ({ modelId: 'test-model' })),
  })),
}));

jest.mock('ai', () => ({
  wrapLanguageModel: jest.fn(({ model }) => model),
}));

jest.mock('./tools', () => ({ tools: [] }));
jest.mock('./systemPrompt', () => ({ getSystemPrompt: () => 'prompt' }));
jest.mock('./notifierBot', () => ({
  getNotifierBot: () => ({ sendMessage: jest.fn() }),
}));
jest.mock('./tokenUsageMiddleware', () => ({
  createTokenUsageMiddleware: () => ({ specificationVersion: 'v3' }),
}));

const { buildAgent } = require('./runtime');

test('BuiltInAgent forwards hidden developer confirmation messages', () => {
  buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'key',
    model: 'deployment',
  });

  expect(mockBuiltInAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      forwardDeveloperMessages: true,
    }),
  );
});
