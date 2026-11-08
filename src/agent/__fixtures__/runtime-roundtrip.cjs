// Run in Node 22: Jest's CommonJS loader cannot load the runtime's ESM bridge.
// Uses the real runtime, BuiltInAgent, Azure Responses provider and AI SDK loop.
const assert = require('node:assert/strict');
const { runWithRequestContext } = require('../requestContext');
const { getAgentChatId } = require('../identity');
const z = require('zod');
const { AI_MODEL } = require('../../aiModel');

const invocations = [];
const tools = ['synthetic_read', 'synthetic_other', 'synthetic_dependent'].map(
  (name) => ({
    name,
    description: 'Synthetic integration read',
    parameters: z.object({ marker: z.string() }),
    execute: async ({ marker }) => {
      await new Promise((resolve) =>
        setTimeout(resolve, marker === 'slow' ? 30 : 0),
      );
      const result = { marker, owner: getAgentChatId() };
      invocations.push({ name, ...result });

      return result;
    },
  }),
);
require.cache[require.resolve('../tools')] = { exports: { tools } };
require.cache[require.resolve('../notifierBot')] = {
  exports: { getNotifierBot: () => ({ sendMessage: async () => undefined }) },
};

const requests = [];
const created = (id) => ({
  type: 'response.created',
  response: { id, created_at: 1, model: AI_MODEL },
});
const completed = {
  type: 'response.completed',
  response: {
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 1 },
    },
  },
};
const callEvents = (call, index) => [
  {
    type: 'response.output_item.added',
    output_index: index,
    item: { ...call, arguments: '' },
  },
  {
    type: 'response.function_call_arguments.delta',
    item_id: call.id,
    output_index: index,
    delta: call.arguments,
  },
  {
    type: 'response.output_item.done',
    output_index: index,
    item: { ...call, status: 'completed' },
  },
];
const call = (id, name, marker) => ({
  type: 'function_call',
  id: `function-${id}`,
  call_id: id,
  name,
  arguments: JSON.stringify({ marker }),
});

global.fetch = async (url, init) => {
  assert.equal(
    new URL(url).host,
    'synthetic.openai.azure.com',
    'No real network calls allowed',
  );
  assert.equal(new URL(url).pathname, '/openai/v1/responses');
  const body = JSON.parse(init.body);
  requests.push(body);
  assert.equal(body.model, AI_MODEL);
  assert.equal(
    body.parallel_tool_calls,
    process.env.EXPECT_PARALLEL === 'true',
  );
  assert.equal(body.reasoning.effort, 'medium');
  assert.equal(body.store, false);
  assert(
    body.input.some(
      (message) =>
        message.role === 'developer' &&
        JSON.stringify(message).includes('hidden-confirmation-test'),
    ),
  );
  const sequential = JSON.stringify(body.input).includes('dependent scenario');
  const outputs = body.input.filter(
    (item) => item.type === 'function_call_output',
  );
  const events = [created(`response-${requests.length}`)];
  if (!outputs.length) {
    const calls = sequential
      ? [call('dependency-source', 'synthetic_read', 'source')]
      : [
          call('slow-call', 'synthetic_read', 'slow'),
          call('other-call', 'synthetic_other', 'other'),
          call('fast-call', 'synthetic_read', 'fast'),
        ];
    events.push(...calls.flatMap(callEvents));
  } else if (sequential && outputs.length === 1) {
    assert.deepEqual(JSON.parse(outputs[0].output), {
      marker: 'source',
      owner: 202,
    });
    events.push(
      ...callEvents(
        call('dependency-result', 'synthetic_dependent', 'derived-from-source'),
        0,
      ),
    );
  } else {
    const expected = sequential
      ? ['dependency-source', 'dependency-result']
      : ['slow-call', 'other-call', 'fast-call'];
    assert.deepEqual(
      outputs.map((output) => output.call_id).sort(),
      expected.sort(),
    );
    for (const output of outputs) {
      assert.equal(JSON.parse(output.output).owner, sequential ? 202 : 101);
    }
    const message = { type: 'message', id: `message-${requests.length}` };
    events.push(
      { type: 'response.output_item.added', output_index: 0, item: message },
      {
        type: 'response.output_text.delta',
        item_id: message.id,
        delta: 'All synthetic results received.',
      },
      { type: 'response.output_item.done', output_index: 0, item: message },
    );
  }
  events.push(completed);

  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
};

(async () => {
  const { getCopilotRuntimeHandler } = require('../runtime');
  const handler = getCopilotRuntimeHandler();
  const responses = await Promise.all(
    [
      [101, 'parallel scenario'],
      [202, 'dependent scenario'],
    ].map(([chatId, prompt]) =>
      runWithRequestContext({ chatId, sub: `account-${chatId}` }, async () => {
        const response = await handler(
          new Request('http://localhost/api/agent/copilotkit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'agent/run',
              params: { agentId: 'default' },
              body: {
                threadId: `thread-${chatId}`,
                runId: `run-${chatId}`,
                state: {},
                tools: [],
                context: [],
                forwardedProps: {},
                messages: [
                  { id: `user-${chatId}`, role: 'user', content: prompt },
                  {
                    id: `hidden-${chatId}`,
                    role: 'developer',
                    content: 'hidden-confirmation-test',
                  },
                ],
              },
            }),
          }),
        );
        assert.equal(response.status, 200);
        const text = await response.text();
        const events = text
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => JSON.parse(line.slice(6)));
        assert(!events.some((event) => event.type === 'RUN_ERROR'), text);
        assert(
          events.some((event) => event.type === 'RUN_FINISHED'),
          text,
        );
        assert(
          events.some(
            (event) => event.delta === 'All synthetic results received.',
          ),
          text,
        );

        return events;
      }),
    ),
  );
  assert.equal(requests.length, 5);
  assert.equal(invocations.length, 5);
  const parallel = responses[0].filter(
    (event) => event.type === 'TOOL_CALL_RESULT',
  );
  assert.deepEqual(parallel.map((event) => event.toolCallId).sort(), [
    'fast-call',
    'other-call',
    'slow-call',
  ]);
  assert(
    invocations.findIndex((item) => item.marker === 'fast') <
      invocations.findIndex((item) => item.marker === 'slow'),
  );
  assert(
    invocations.findIndex((item) => item.marker === 'source') <
      invocations.findIndex((item) => item.marker === 'derived-from-source'),
  );
  const send = (context, envelope) =>
    runWithRequestContext(context, () =>
      handler(
        new Request('http://localhost/api/agent/copilotkit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
        }),
      ),
    );
  const read = {
    method: 'resource/request',
    params: { httpMethod: 'GET', path: '/threads/thread-101/messages' },
  };
  const own = await send({ chatId: 101, sub: 'account-101' }, read);
  assert.equal(own.status, 200);
  assert((await own.text()).includes('All synthetic results received.'));
  for (const context of [
    { chatId: 202, sub: 'account-202' },
    { chatId: 101, sub: 'other-google-account' },
  ]) {
    const foreign = await send(context, read);
    assert.equal(foreign.status, 200);
    assert.deepEqual(await foreign.json(), { messages: [] });
    const connect = await send(context, {
      method: 'agent/connect',
      params: { agentId: 'default' },
      body: {
        threadId: 'thread-101',
        runId: 'forbidden-connect',
        tools: [],
        context: [],
        state: {},
        messages: [],
      },
    });
    assert.equal(connect.status, 200);
    assert.equal(await connect.text(), '');
    const run = await send(context, {
      method: 'agent/run',
      params: { agentId: 'default' },
      body: {
        threadId: 'thread-101',
        runId: 'forbidden-run',
        tools: [],
        context: [],
        state: {},
        messages: [],
      },
    });
    assert.equal(run.status, 404);
    const stop = await send(context, {
      method: 'agent/stop',
      params: { agentId: 'default', threadId: 'thread-101' },
      body: { runId: 'run-101' },
    });
    assert.equal((await stop.json()).stopped, false);
  }
  const list = await send(
    { chatId: 101, sub: 'account-101' },
    {
      method: 'resource/request',
      params: { httpMethod: 'GET', path: '/threads?agentId=default' },
    },
  );
  assert.equal(list.status, 200);
  const listing = await list.text();
  assert(listing.includes('thread-101'));
  assert(!listing.includes('thread-202'));
  assert.equal(
    requests.length,
    5,
    'Rejected requests must not reach the model',
  );
  console.log(
    'Runtime round trips passed: concurrent independent reads, sequential dependencies, hidden messages, isolated request identity, final synthesis.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
