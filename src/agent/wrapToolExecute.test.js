// Mock the notifier bot + sendErrorMessage seam BEFORE requiring the
// module under test. Jest hoists `jest.mock` factories above any
// `const` declarations in this file, so we cannot reference outer
// variables from inside the factory — we declare `jest.fn()` inline
// and reach back into it via `require()` once the wrapper module is
// loaded.

jest.mock('../utils/utils', () => ({
  sendErrorMessage: jest.fn(),
}));

jest.mock('./notifierBot', () => ({
  getNotifierBot: () => ({ sendMessage: jest.fn() }),
}));

jest.mock('./identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));

jest.mock('../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(async () => ({
    lang: 'en',
    fresh: true,
  })),
}));

const { sendErrorMessage } = require('../utils/utils');
const {
  wrapToolExecute,
  isToolErrorResult,
  TOOL_ERROR_STATUS,
  DEFAULT_USER_MESSAGE,
} = require('./wrapToolExecute');

beforeEach(() => {
  sendErrorMessage.mockReset();
  sendErrorMessage.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isToolErrorResult', () => {
  test('matches the exact discriminator shape', () => {
    expect(isToolErrorResult({ status: TOOL_ERROR_STATUS })).toBe(true);
    expect(
      isToolErrorResult({ status: TOOL_ERROR_STATUS, tool: 'x', errorId: 'y' }),
    ).toBe(true);
  });

  test('rejects everything else', () => {
    expect(isToolErrorResult(null)).toBe(false);
    expect(isToolErrorResult(undefined)).toBe(false);
    expect(isToolErrorResult('tool_error')).toBe(false);
    expect(isToolErrorResult({ status: 'ok' })).toBe(false);
    expect(isToolErrorResult({ status: 'no_teams' })).toBe(false);
    expect(isToolErrorResult({ tool: 'foo' })).toBe(false);
    expect(isToolErrorResult(42)).toBe(false);
  });
});

describe('wrapToolExecute — success path', () => {
  test('passes the return value through unchanged', async () => {
    const fn = jest.fn(async () => ({ status: 'ok', data: [1, 2, 3] }));
    const wrapped = wrapToolExecute('my_tool', fn);

    const result = await wrapped({ foo: 'bar' });

    expect(result).toEqual({ status: 'ok', data: [1, 2, 3] });
    expect(sendErrorMessage).not.toHaveBeenCalled();
  });

  test('preserves args exactly (object identity)', async () => {
    const receivedArgs = [];
    const fn = jest.fn(async (args) => {
      receivedArgs.push(args);

      return 'ok';
    });
    const wrapped = wrapToolExecute('my_tool', fn);

    const inputs = { a: 1, nested: { b: 2 } };
    await wrapped(inputs);

    expect(receivedArgs).toHaveLength(1);
    expect(receivedArgs[0]).toBe(inputs);
  });

  test('handles `undefined` return as a real value (not an error)', async () => {
    const fn = jest.fn(async () => undefined);
    const wrapped = wrapToolExecute('my_tool', fn);

    const result = await wrapped();

    expect(result).toBeUndefined();
    expect(sendErrorMessage).not.toHaveBeenCalled();
  });
});

describe('wrapToolExecute — error path', () => {
  test('catches async rejection and returns tool_error shape', async () => {
    const err = new Error('boom');
    const fn = jest.fn(async () => {
      throw err;
    });
    const wrapped = wrapToolExecute('my_tool', fn);

    const result = await wrapped();

    expect(isToolErrorResult(result)).toBe(true);
    expect(result.tool).toBe('my_tool');
    expect(typeof result.errorId).toBe('string');
    expect(result.errorId).toHaveLength(8);
    expect(result.userMessage).toBe(DEFAULT_USER_MESSAGE);
  });

  test('catches sync throw inside the execute body', async () => {
    const fn = () => {
      throw new Error('sync boom');
    };
    const wrapped = wrapToolExecute('my_tool', fn);

    const result = await wrapped();

    expect(isToolErrorResult(result)).toBe(true);
    expect(result.tool).toBe('my_tool');
  });

  test('handles non-Error throw values gracefully (string, object, number)', async () => {
    for (const thrown of ['string error', { code: 42 }, 42, null]) {
      const fn = async () => {
        // eslint-disable-next-line no-throw-literal
        throw thrown;
      };
      const wrapped = wrapToolExecute('t', fn);
      const result = await wrapped();
      expect(isToolErrorResult(result)).toBe(true);
      expect(result.tool).toBe('t');
    }
  });

  test('routes the full technical error to the error channel with the same errorId', async () => {
    const err = new Error('Azure storage 403 https://x.blob.core.windows.net/whatever');
    err.stack = 'Error: Azure storage 403 ...\n    at foo (bar.js:1:1)';
    const fn = async () => {
      throw err;
    };
    const wrapped = wrapToolExecute('storage_tool', fn);

    const result = await wrapped();

    expect(sendErrorMessage).toHaveBeenCalledTimes(1);
    const [, sentMessage] = sendErrorMessage.mock.calls[0];
    expect(sentMessage).toContain('Agent tool "storage_tool" threw');
    expect(sentMessage).toContain(`[${result.errorId}]`);
    expect(sentMessage).toContain('Azure storage 403');
    // Stack is included so we can debug from the error channel.
    expect(sentMessage).toContain('at foo (bar.js:1:1)');
  });

  test('NEVER includes the raw technical message in the returned user-facing result', async () => {
    const fn = async () => {
      throw new Error(
        'leaky secret: https://storage.blob.core.windows.net/?sig=abc',
      );
    };
    const wrapped = wrapToolExecute('t', fn);

    const result = await wrapped();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('leaky secret');
    expect(serialized).not.toContain('storage.blob.core.windows.net');
    expect(serialized).not.toContain('sig=abc');
  });

  test('sendErrorMessage failure does NOT break the tool — still returns tool_error', async () => {
    sendErrorMessage.mockRejectedValue(new Error('telegram down'));
    const fn = async () => {
      throw new Error('original');
    };
    const wrapped = wrapToolExecute('t', fn);

    const result = await wrapped();

    expect(isToolErrorResult(result)).toBe(true);
    expect(result.tool).toBe('t');
    // The log-failure path uses console.error — we mocked it but we
    // can still assert it was reached.
    // eslint-disable-next-line no-console
    expect(console.error).toHaveBeenCalled();
  });

  test('errorId is unique across calls (sample of 50)', async () => {
    const fn = async () => {
      throw new Error('x');
    };
    const wrapped = wrapToolExecute('t', fn);

    const ids = new Set();
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = await wrapped();
      ids.add(r.errorId);
    }
    expect(ids.size).toBe(50);
  });

  test('localizes tool errors from the durable saved language', async () => {
    const {
      getFreshLanguagePreference,
    } = require('../services/setLanguageService');
    getFreshLanguagePreference.mockResolvedValueOnce({
      lang: 'he',
      fresh: true,
    });
    const wrapped = wrapToolExecute('t', async () => {
      throw new Error('boom');
    });

    const result = await wrapped();

    expect(result.uiLang).toBe('he');
    expect(result.userMessage).toContain('אירעה שגיאה');
  });
});
