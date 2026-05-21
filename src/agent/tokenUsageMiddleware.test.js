const {
  createTokenUsageMiddleware,
  formatLine,
  safeTotal,
} = require('./tokenUsageMiddleware');

// Helper: collect every chunk that lands on the downstream end of a
// ReadableStream so a test can assert on order/contents.
async function collectStream(stream) {
  const reader = stream.getReader();
  const out = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {break;}
    out.push(value);
  }

  return out;
}

function makeReadable(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

// `sendLogMessage(bot, line)` calls `bot.sendMessage(LOG_CHANNEL_ID, line)`
// internally, so faking the bot is enough to observe what was logged.
// We tag the fake bot with `_logPrefix: 'AGENT'` to mirror the production
// notifier bot — `sendLogMessage` reads that to choose the line prefix.
function makeBot() {
  const calls = [];

  return {
    calls,
    _logPrefix: 'AGENT',
    sendMessage: jest.fn(async (chatId, line) => {
      calls.push({ chatId, line });
    }),
  };
}

const FAKE_MODEL = { modelId: 'gpt-test-1' };

describe('safeTotal', () => {
  test('returns 0 when field is missing', () => {
    expect(safeTotal(undefined)).toBe(0);
    expect(safeTotal(null)).toBe(0);
  });

  test('returns 0 when total is undefined / NaN', () => {
    expect(safeTotal({ total: undefined })).toBe(0);
    expect(safeTotal({ total: Number.NaN })).toBe(0);
  });

  test('returns total when finite', () => {
    expect(safeTotal({ total: 42 })).toBe(42);
    expect(safeTotal({ total: 0 })).toBe(0);
  });
});

describe('formatLine', () => {
  test('produces the expected log format', () => {
    const line = formatLine({
      modelId: 'gpt-4o',
      step: 2,
      prompt: 100,
      completion: 50,
      total: 150,
    });
    expect(line).toBe(
      'Agent step usage — model: gpt-4o, step: 2, prompt: 100, completion: 50, total: 150',
    );
  });
});

describe('createTokenUsageMiddleware', () => {
  beforeEach(() => {
    // Suppress the console.error spam from intentionally-failing send paths
    // so jest output stays readable.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('emits a log line for each finish chunk with nested V3 usage', async () => {
    const bot = makeBot();
    const middleware = createTokenUsageMiddleware({ bot });

    const upstream = makeReadable([
      { type: 'text-delta', delta: 'hello ' },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: {
          inputTokens: { total: 120 },
          outputTokens: { total: 30 },
        },
      },
      { type: 'text-delta', delta: 'world' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 200 },
          outputTokens: { total: 80 },
        },
      },
    ]);

    const result = await middleware.wrapStream({
      doStream: async () => ({ stream: upstream }),
      doGenerate: async () => {
        throw new Error('not used');
      },
      params: {},
      model: FAKE_MODEL,
    });

    const out = await collectStream(result.stream);
    expect(out).toHaveLength(4);

    // Flush the fire-and-forget log promises before assertion.
    await new Promise((r) => setImmediate(r));

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
    const firstLine = bot.calls[0].line;
    const secondLine = bot.calls[1].line;
    expect(firstLine).toContain('AGENT: Agent step usage');
    expect(firstLine).toContain('model: gpt-test-1');
    expect(firstLine).toContain('step: 1');
    expect(firstLine).toContain('prompt: 120');
    expect(firstLine).toContain('completion: 30');
    expect(firstLine).toContain('total: 150');

    expect(secondLine).toContain('step: 2');
    expect(secondLine).toContain('prompt: 200');
    expect(secondLine).toContain('completion: 80');
    expect(secondLine).toContain('total: 280');
  });

  test('treats missing nested totals as zero (no crash)', async () => {
    const bot = makeBot();
    const middleware = createTokenUsageMiddleware({ bot });

    const upstream = makeReadable([
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: { total: undefined },
          outputTokens: {},
        },
      },
    ]);

    const result = await middleware.wrapStream({
      doStream: async () => ({ stream: upstream }),
      doGenerate: async () => {
        throw new Error('not used');
      },
      params: {},
      model: FAKE_MODEL,
    });
    await collectStream(result.stream);
    await new Promise((r) => setImmediate(r));

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.calls[0].line).toContain('prompt: 0');
    expect(bot.calls[0].line).toContain('completion: 0');
    expect(bot.calls[0].line).toContain('total: 0');
  });

  test('non-finish chunks pass through without logging', async () => {
    const bot = makeBot();
    const middleware = createTokenUsageMiddleware({ bot });

    const chunks = [
      { type: 'text-delta', delta: 'a' },
      { type: 'tool-call', toolCallId: 't1', toolName: 'foo', input: {} },
      { type: 'text-delta', delta: 'b' },
    ];
    const upstream = makeReadable(chunks);

    const result = await middleware.wrapStream({
      doStream: async () => ({ stream: upstream }),
      doGenerate: async () => {
        throw new Error('not used');
      },
      params: {},
      model: FAKE_MODEL,
    });
    const out = await collectStream(result.stream);
    await new Promise((r) => setImmediate(r));

    expect(out).toEqual(chunks);
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  test('telegram failure does not break the stream', async () => {
    const bot = {
      sendMessage: jest
        .fn()
        .mockRejectedValue(new Error('telegram is down')),
    };
    const middleware = createTokenUsageMiddleware({ bot });

    const upstream = makeReadable([
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 10 },
          outputTokens: { total: 5 },
        },
      },
      { type: 'text-delta', delta: 'still flowing' },
    ]);

    const result = await middleware.wrapStream({
      doStream: async () => ({ stream: upstream }),
      doGenerate: async () => {
        throw new Error('not used');
      },
      params: {},
      model: FAKE_MODEL,
    });

    // The stream MUST still emit every upstream chunk even though the
    // log-send is rejecting in the background.
    const out = await collectStream(result.stream);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ type: 'text-delta', delta: 'still flowing' });

    // Allow the unhandled-rejection-catch to run.
    await new Promise((r) => setImmediate(r));
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  test('preserves result fields beyond stream (request/response metadata)', async () => {
    const bot = makeBot();
    const middleware = createTokenUsageMiddleware({ bot });

    const upstream = makeReadable([]);
    const result = await middleware.wrapStream({
      doStream: async () => ({
        stream: upstream,
        request: { body: { x: 1 } },
        response: { headers: { 'x-foo': 'bar' } },
      }),
      doGenerate: async () => {
        throw new Error('not used');
      },
      params: {},
      model: FAKE_MODEL,
    });

    expect(result.request).toEqual({ body: { x: 1 } });
    expect(result.response).toEqual({ headers: { 'x-foo': 'bar' } });
  });

  test('handles missing modelId gracefully', async () => {
    const bot = makeBot();
    const middleware = createTokenUsageMiddleware({ bot });

    const upstream = makeReadable([
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 1 },
          outputTokens: { total: 2 },
        },
      },
    ]);

    const result = await middleware.wrapStream({
      doStream: async () => ({ stream: upstream }),
      doGenerate: async () => {
        throw new Error('not used');
      },
      params: {},
      model: {},
    });
    await collectStream(result.stream);
    await new Promise((r) => setImmediate(r));

    expect(bot.calls[0].line).toContain('model: unknown');
  });
});
