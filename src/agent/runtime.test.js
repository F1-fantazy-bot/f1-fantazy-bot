const mockBuiltInAgent = jest.fn((config) => ({ config }));

jest.mock('@copilotkit/runtime/v2', () => ({
  CopilotRuntime: jest.fn(),
  BuiltInAgent: mockBuiltInAgent,
  createCopilotRuntimeHandler: jest.fn(),
}));

jest.mock('@ai-sdk/azure', () => ({
  createAzure: jest.fn(() => ({
    responses: jest.fn(() => ({ modelId: 'test-model' })),
  })),
}));

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
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

const { buildAgent, getCopilotRuntimeHandler } = require('./runtime');
const { createAzure } = require('@ai-sdk/azure');

test('BuiltInAgent forwards hidden developer confirmation messages', () => {
  buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'key',
  });

  expect(mockBuiltInAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      forwardDeveloperMessages: true,
    }),
  );
});

test('Sol uses supported medium reasoning without a reasoning-model override', () => {
  buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'key',
  });

  expect(mockBuiltInAgent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningEffort: 'medium',
          store: false,
        },
      },
    }),
  );
});

test.each([undefined, 'incompatible-deployment'])(
  'pins the agent model when the old model environment setting is %s',
  (oldModel) => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/',
      AZURE_OPENAI_API_KEY: 'test-key',
    };
    delete process.env.AZURE_OPEN_AI_MODEL;
    if (oldModel) {
      process.env.AZURE_OPEN_AI_MODEL = oldModel;
    }
    try {
      getCopilotRuntimeHandler();
      expect(createAzure).toHaveBeenLastCalledWith({
        baseURL: 'https://example.openai.azure.com/openai',
        apiKey: 'test-key',
        apiVersion: 'v1',
        useDeploymentBasedUrls: false,
      });
      expect(
        createAzure.mock.results.at(-1).value.responses,
      ).toHaveBeenCalledWith('gpt-6.1-sol');
    } finally {
      process.env = originalEnv;
    }
  },
);

test('the real Azure provider serializes Sol reasoning settings with tools', async () => {
  const fetch = jest.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 'response',
          created_at: 1,
          model: 'gpt-6.1-sol',
          output: [
            {
              id: 'message',
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_text', text: 'Hello', annotations: [] },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
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
  expect(new URL(url).pathname).toBe('/openai/v1/responses');
  expect(new URL(url).searchParams.get('api-version')).toBe('v1');
  expect(JSON.parse(request.body)).toMatchObject({
    model: 'gpt-6.1-sol',
    reasoning: { effort: 'medium' },
    max_output_tokens: 8192,
    parallel_tool_calls: false,
    store: false,
    include: ['reasoning.encrypted_content'],
    input: [
      { role: 'developer', content: 'Use tools when appropriate.' },
      { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
    ],
    tools: [{ type: 'function', name: 'get_next_races' }],
  });
  const body = JSON.parse(request.body);
  expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('max_tokens');
  expect(body).not.toHaveProperty('reasoning_effort');
});

test('the real CopilotKit agent completes a streamed Responses tool round trip', async () => {
  const completed = {
    type: 'response.completed',
    response: {
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 3 },
      },
    },
  };
  const created = (id) => ({
    type: 'response.created',
    response: { id, created_at: 1, model: 'gpt-6.1-sol' },
  });
  const reasoning = {
    type: 'reasoning',
    id: 'reasoning-1',
    encrypted_content: 'encrypted-reasoning',
  };
  const call = {
    type: 'function_call',
    id: 'function-1',
    call_id: 'call-1',
    name: 'get_next_races',
    arguments: '{}',
  };
  const message = { type: 'message', id: 'message-1' };
  const streams = [
    [
      created('response-1'),
      { type: 'response.output_item.added', output_index: 0, item: reasoning },
      { type: 'response.output_item.done', output_index: 0, item: reasoning },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: { ...call, arguments: '' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: call.id,
        output_index: 1,
        delta: '{}',
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: { ...call, status: 'completed' },
      },
      completed,
    ],
    [
      created('response-2'),
      { type: 'response.output_item.added', output_index: 0, item: message },
      {
        type: 'response.output_text.delta',
        item_id: message.id,
        delta: 'The next race is Japan.',
      },
      { type: 'response.output_item.done', output_index: 0, item: message },
      completed,
    ],
  ];
  const fetch = jest.fn(async () => {
    const events = streams.shift();
    if (!events) {
      throw new Error('Unexpected extra model request');
    }

    return new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      {
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
  });
  const { createAzure: realCreateAzure } = jest.requireActual('@ai-sdk/azure');
  createAzure.mockImplementationOnce((options) =>
    realCreateAzure({ ...options, fetch }),
  );
  // Load the real agent module directly: the umbrella runtime also loads an
  // unrelated ESM HTTP bridge that this CommonJS Jest runner cannot parse.
  const path = require('node:path');
  const agentModulePath = path.join(
    path.dirname(require.resolve('@copilotkit/runtime/v2')),
    '../agent/index.cjs',
  );
  const { BuiltInAgent: RealBuiltInAgent } =
    jest.requireActual(agentModulePath);
  const execute = jest.fn(async () => ({ race: 'Japan' }));
  mockBuiltInAgent.mockImplementationOnce(
    (config) =>
      new RealBuiltInAgent({
        ...config,
        tools: [
          {
            name: 'get_next_races',
            description: 'Get the next race',
            parameters: require('zod').object({}),
            execute,
          },
        ],
      }),
  );
  const agent = buildAgent({
    endpoint: 'https://example.openai.azure.com',
    apiKey: 'test-key',
  });
  const events = [];
  await new Promise((resolve, reject) =>
    agent
      .run({
        threadId: 'thread-1',
        runId: 'run-1',
        tools: [],
        context: [],
        state: {},
        messages: [
          { id: 'user-1', role: 'user', content: 'What is the next race?' },
        ],
      })
      .subscribe({
        next: (event) => events.push(event),
        error: reject,
        complete: resolve,
      }),
  );

  expect(execute).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, request] of fetch.mock.calls) {
    expect(new URL(url).pathname).toBe('/openai/v1/responses');
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'gpt-6.1-sol',
      stream: true,
      reasoning: { effort: 'medium' },
      parallel_tool_calls: false,
      store: false,
    });
  }
  const continuation = JSON.parse(fetch.mock.calls[1][1].body);
  expect(continuation.input).toEqual(
    expect.arrayContaining([
      expect.objectContaining(reasoning),
      // Stateless requests replay the call by call_id; the provider omits
      // the server-side function item ID when response storage is disabled.
      expect.objectContaining({
        type: call.type,
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments,
      }),
      expect.objectContaining({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify({ race: 'Japan' }),
      }),
    ]),
  );
  expect(events.some((event) => event.type === 'RUN_ERROR')).toBe(false);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'TOOL_CALL_RESULT',
        toolCallId: call.call_id,
      }),
      expect.objectContaining({
        type: 'TEXT_MESSAGE_CHUNK',
        delta: 'The next race is Japan.',
      }),
      expect.objectContaining({ type: 'RUN_FINISHED' }),
    ]),
  );
});
