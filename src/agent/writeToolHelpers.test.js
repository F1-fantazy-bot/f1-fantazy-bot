// Mock out the seams we don't want to exercise in unit tests.

jest.mock('@copilotkit/runtime/v2', () => ({
  // The real defineTool freezes/validates a few fields but is otherwise
  // a pass-through. For unit tests we just need the `execute` wired
  // back out so we can call it.
  defineTool: (spec) => ({ ...spec }),
}));

jest.mock('../utils/utils', () => ({
  sendErrorMessage: jest.fn(),
}));

jest.mock('./notifierBot', () => ({
  getNotifierBot: () => ({ sendMessage: jest.fn() }),
}));

jest.mock('./cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));

jest.mock('../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(async () => ({ lang: 'en' })),
}));

jest.mock('../services/pendingWritesStore', () => {
  const intents = new Map();
  let nonceCounter = 0;
  const CONSUME_STATUS = {
    CONSUMED: 'consumed',
    NOT_FOUND: 'not_found',
    NOT_APPROVED: 'not_approved',
  };

  return {
    CONSUME_STATUS,
    stagePendingWrite: jest.fn(async (intent) => {
      const writeNonce = `nonce-${++nonceCounter}`;
      intents.set(`${intent.chatId}:${writeNonce}`, {
        ...intent,
        state: 'staged',
      });

      return writeNonce;
    }),
    approvePendingWrite: jest.fn(async ({ chatId, writeNonce }) => {
      const key = `${chatId}:${writeNonce}`;
      const intent = intents.get(key);
      if (!intent) {return null;}
      intent.state = 'approved';

      return intent;
    }),
    consumeApprovedPendingWrite: jest.fn(async ({ chatId, writeNonce }) => {
      const key = `${chatId}:${writeNonce}`;
      const intent = intents.get(key);
      if (!intent) {return { status: CONSUME_STATUS.NOT_FOUND };}
      if (intent.state !== 'approved') {
        return { status: CONSUME_STATUS.NOT_APPROVED };
      }
      intents.delete(key);

      return { status: CONSUME_STATUS.CONSUMED, intent };
    }),
    resetForTests: () => {
      intents.clear();
      nonceCounter = 0;
    },
  };
});

const z = require('zod');
const {
  defineWriteTool,
  executeConfirmedWrite,
  resetWriteToolRegistryForTests,
  WRITE_RESULT_STATUSES,
} = require('./writeToolHelpers');
const { ensureCacheReady } = require('./cacheBootstrap');
const { getAgentChatId } = require('./identity');
const {
  getFreshLanguagePreference,
} = require('../services/setLanguageService');
const { userCache } = require('../cache');
const {
  approvePendingWrite,
  resetForTests: resetStore,
} = require('../services/pendingWritesStore');

beforeEach(() => {
  resetWriteToolRegistryForTests();
  resetStore();
  ensureCacheReady.mockClear();
  getAgentChatId.mockReset();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en', fresh: true });
  for (const key of Object.keys(userCache)) {
    delete userCache[key];
  }
});

function buildTool(overrides = {}) {
  return defineWriteTool({
    name: 'set_language',
    description: 'Change the user-interface language.',
    parameters: z.object({ lang: z.string().min(2).max(5) }),
    buildSummary: ({ args }) => `Change language to "${args.lang}".`,
    commit: jest.fn().mockResolvedValue({
      status: WRITE_RESULT_STATUSES.OK,
      summary: 'Language updated.',
    }),
    ...overrides,
  });
}

describe('defineWriteTool — propose-call behaviour', () => {
  test('returns confirmation_required envelope with nonce + summary', async () => {
    const tool = buildTool();
    const result = await tool.execute({ lang: 'he' });
    expect(result.status).toBe(WRITE_RESULT_STATUSES.CONFIRMATION_REQUIRED);
    expect(result.tool).toBe('set_language');
    expect(typeof result.writeNonce).toBe('string');
    expect(result.writeNonce.length).toBeGreaterThan(0);
    expect(result.summary).toBe('Change language to "he".');
    expect(result.args).toEqual({ lang: 'he' });
    expect(result.uiLang).toBe('en');
  });

  test('does NOT call commit on the propose call', async () => {
    const commit = jest.fn();
    const tool = buildTool({ commit });
    await tool.execute({ lang: 'he' });
    expect(commit).not.toHaveBeenCalled();
  });

  test('always awaits ensureCacheReady before staging', async () => {
    const tool = buildTool();
    await tool.execute({ lang: 'he' });
    expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  });

  test('short-circuits when validate returns a status envelope', async () => {
    const validate = jest.fn().mockResolvedValue({
      status: WRITE_RESULT_STATUSES.INVALID_INPUT,
      tool: 'set_language',
      summary: 'Unsupported language code.',
    });
    const commit = jest.fn();
    const tool = buildTool({ validate, commit });
    const result = await tool.execute({ lang: 'xx' });
    expect(result.status).toBe(WRITE_RESULT_STATUSES.INVALID_INPUT);
    expect(commit).not.toHaveBeenCalled();
    // No nonce should have been issued.
    expect(result.writeNonce).toBeUndefined();
  });

  test('proceeds when validate returns null', async () => {
    const validate = jest.fn().mockResolvedValue(null);
    const tool = buildTool({ validate });
    const result = await tool.execute({ lang: 'he' });
    expect(validate).toHaveBeenCalledWith({ chatId: 42, args: { lang: 'he' } });
    expect(result.status).toBe(WRITE_RESULT_STATUSES.CONFIRMATION_REQUIRED);
  });

  test('throws-converted-to-tool_error when Zod parse fails', async () => {
    const tool = buildTool();
    const result = await tool.execute({ lang: 'x' });
    // wrapToolExecute swallows the throw and returns the tool_error envelope.
    expect(result.status).toBe('tool_error');
  });

  test('chatId resolution failure is converted to tool_error', async () => {
    getAgentChatId.mockImplementation(() => {
      throw new Error('no chatId');
    });
    const tool = buildTool();
    const result = await tool.execute({ lang: 'he' });
    expect(result.status).toBe('tool_error');
  });
});

describe('executeConfirmedWrite — confirm-call behaviour', () => {
  test('rejects confirmation until the UI approval endpoint marks the intent approved', async () => {
    const commit = jest.fn();
    const tool = buildTool({ commit });
    const proposed = await tool.execute({ lang: 'he' });

    const result = await executeConfirmedWrite({
      chatId: 42,
      writeNonce: proposed.writeNonce,
    });

    expect(result.status).toBe(WRITE_RESULT_STATUSES.FORBIDDEN);
    expect(result.uiLang).toBe('en');
    expect(commit).not.toHaveBeenCalled();
  });

  test('consumes an approved intent and invokes commit with the staged args', async () => {
    const commit = jest.fn().mockResolvedValue({
      status: WRITE_RESULT_STATUSES.OK,
      summary: 'Language updated.',
    });
    const tool = buildTool({ commit });

    const proposed = await tool.execute({ lang: 'he' });
    const writeNonce = proposed.writeNonce;
    await approvePendingWrite({ chatId: 42, writeNonce });

    const result = await executeConfirmedWrite({ chatId: 42, writeNonce });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({
      chatId: 42,
      args: { lang: 'he' },
    });
    expect(result.status).toBe(WRITE_RESULT_STATUSES.OK);
    expect(result.tool).toBe('set_language');
  });

  test('returns not_found for an unknown nonce', async () => {
    buildTool();
    const result = await executeConfirmedWrite({
      chatId: 42,
      writeNonce: 'no-such-nonce',
    });
    expect(result.status).toBe(WRITE_RESULT_STATUSES.NOT_FOUND);
    expect(result.uiLang).toBe('en');
  });

  test('localizes expected confirmation failures from the refreshed language', async () => {
    userCache['42'] = { lang: 'he' };
    getFreshLanguagePreference.mockResolvedValue({ lang: 'he', fresh: true });

    const result = await executeConfirmedWrite({
      chatId: 42,
      writeNonce: 'no-such-nonce',
    });

    expect(result.uiLang).toBe('he');
    expect(result.summary).toContain('לא נמצא שינוי ממתין');
  });

  test('rejects a nonce that was issued for a different chatId', async () => {
    const commit = jest.fn();
    const tool = buildTool({ commit });
    const proposed = await tool.execute({ lang: 'he' });
    await approvePendingWrite({
      chatId: 42,
      writeNonce: proposed.writeNonce,
    });

    const result = await executeConfirmedWrite({
      chatId: 99,
      writeNonce: proposed.writeNonce,
    });
    expect(result.status).toBe(WRITE_RESULT_STATUSES.NOT_FOUND);
    expect(commit).not.toHaveBeenCalled();
  });

  test('is single-use — a second confirm returns not_found', async () => {
    const commit = jest.fn().mockResolvedValue({
      status: WRITE_RESULT_STATUSES.OK,
      summary: 'OK.',
    });
    const tool = buildTool({ commit });
    const proposed = await tool.execute({ lang: 'he' });
    await approvePendingWrite({
      chatId: 42,
      writeNonce: proposed.writeNonce,
    });

    const first = await executeConfirmedWrite({
      chatId: 42,
      writeNonce: proposed.writeNonce,
    });
    expect(first.status).toBe(WRITE_RESULT_STATUSES.OK);

    const second = await executeConfirmedWrite({
      chatId: 42,
      writeNonce: proposed.writeNonce,
    });
    expect(second.status).toBe(WRITE_RESULT_STATUSES.NOT_FOUND);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  test('awaits ensureCacheReady before invoking commit', async () => {
    const commit = jest.fn().mockResolvedValue({
      status: WRITE_RESULT_STATUSES.OK,
      summary: 'OK.',
    });
    const tool = buildTool({ commit });
    const proposed = await tool.execute({ lang: 'he' });
    await approvePendingWrite({
      chatId: 42,
      writeNonce: proposed.writeNonce,
    });
    ensureCacheReady.mockClear();
    await executeConfirmedWrite({ chatId: 42, writeNonce: proposed.writeNonce });
    expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  });
});

describe('defineWriteTool — input validation of the factory itself', () => {
  test('requires a name', () => {
    expect(() =>
      defineWriteTool({
        name: '',
        description: 'x',
        parameters: z.object({}),
        buildSummary: () => 'x',
        commit: jest.fn(),
      }),
    ).toThrow(/name required/);
  });

  test('requires a Zod schema for parameters', () => {
    expect(() =>
      defineWriteTool({
        name: 't',
        description: 'x',
        parameters: { notZod: true },
        buildSummary: () => 'x',
        commit: jest.fn(),
      }),
    ).toThrow(/parameters must be a Zod schema/);
  });

  test('requires buildSummary and commit', () => {
    expect(() =>
      defineWriteTool({
        name: 't',
        description: 'x',
        parameters: z.object({}),
        buildSummary: () => 'x',
      }),
    ).toThrow(/commit required/);
    expect(() =>
      defineWriteTool({
        name: 't',
        description: 'x',
        parameters: z.object({}),
        commit: jest.fn(),
      }),
    ).toThrow(/buildSummary required/);
  });
});
