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
const { createAzure } = require('@ai-sdk/azure');

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

test.each(['gpt-6.1-sol', 'gpt-5.3-chat'])(
  'uses sequential tool calls with medium reasoning effort for %s',
  (model) => {
    buildAgent({
      endpoint: 'https://example.openai.azure.com',
      apiKey: 'key',
      model,
    });

    expect(createAzure.mock.results.at(-1).value.chat).toHaveBeenCalledWith(model);
    expect(mockBuiltInAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        providerOptions: {
          openai: {
            parallelToolCalls: false,
            reasoningEffort: 'medium',
          },
        },
      }),
    );
  },
);

test('uses sequential tool calls without reasoning effort for GPT-5.6 Terra', () => {
  buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'key',
    model: 'gpt-5.6-terra',
  });

  expect(mockBuiltInAgent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningEffort: 'none',
        },
      },
    }),
  );
});
