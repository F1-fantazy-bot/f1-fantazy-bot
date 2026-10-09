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

test.each(['gpt-5.3-chat'])(
  'uses sequential tool calls with medium reasoning effort for %s',
  (model) => {
    buildAgent({
      endpoint: 'https://example.openai.azure.com',
      apiKey: 'key',
      model,
    });

    expect(createAzure.mock.results.at(-1).value.chat).toHaveBeenCalledWith(
      model,
    );
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

test.each(['gpt-5.6-terra'])(
  'uses sequential tool calls without reasoning effort for %s',
  (model) => {
    buildAgent({
      endpoint: 'https://example.openai.azure.com',
      apiKey: 'key',
      model,
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
  },
);

test('Sol uses supported medium reasoning and explicit reasoning-model handling', () => {
  buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'key',
    model: 'gpt-6.1-sol',
  });

  expect(mockBuiltInAgent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningEffort: 'medium',
          forceReasoning: true,
        },
      },
    }),
  );
});

test('the real Azure provider serializes Sol reasoning settings with tools', async () => {
  const fetch = jest.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 'completion',
          created: 1,
          model: 'gpt-6.1-sol',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const { createAzure: realCreateAzure } = jest.requireActual('@ai-sdk/azure');
  createAzure.mockImplementationOnce((options) =>
    realCreateAzure({ ...options, fetch }),
  );
  const agent = buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'test-key',
    model: 'gpt-6.1-sol',
  });

  await agent.config.model.doGenerate({
    prompt: [
      { role: 'system', content: 'Use tools when appropriate.' },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ],
    maxOutputTokens: 8192,
    temperature: 0.5,
    tools: [
      {
        type: 'function',
        name: 'get_next_races',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    providerOptions: agent.config.providerOptions,
  });

  const [url, request] = fetch.mock.calls[0];
  expect(url).toContain('/deployments/gpt-6.1-sol/chat/completions');
  expect(JSON.parse(request.body)).toMatchObject({
    model: 'gpt-6.1-sol',
    reasoning_effort: 'medium',
    max_completion_tokens: 8192,
    parallel_tool_calls: false,
    messages: [
      { role: 'developer', content: 'Use tools when appropriate.' },
      { role: 'user', content: 'Hello' },
    ],
    tools: [{ type: 'function', function: { name: 'get_next_races' } }],
  });
  const body = JSON.parse(request.body);
  expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('max_tokens');
});
