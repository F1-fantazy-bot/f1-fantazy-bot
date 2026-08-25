// SECURITY-REGRESSION tests for the whoami pre-flight.
//
// The original bug: a Google sign-in alone was treated as "you're in",
// and when the backend was down the user got into the chat UI without
// the allowlist check ever running.
//
// These tests pin the invariant: a failing / unreachable backend MUST
// NEVER resolve to `status: 'ok'`. If this assertion ever fails, the
// security gate is broken — do not weaken these tests.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyAccess, __testing } from './whoami';

const RUNTIME_URL = 'https://example.com/api/agent/copilotkit';
const ID_TOKEN = 'fake.id.token';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockFetchOnce(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

async function drainTimersAndPromises() {
  // Two interleaved tasks need to happen between attempts:
  //  - the awaited fetch promise resolves (microtask)
  //  - the backoff sleep (setTimeout) elapses
  // We tick the timers a few rounds to drain both.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
  await vi.advanceTimersByTimeAsync(__testing.BACKOFF_MS.reduce((a, b) => a + b, 0));
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

describe('whoami URL derivation', () => {
  test('replaces the final segment of the runtime URL', () => {
    expect(__testing.whoamiUrl('https://example.com/api/agent/copilotkit')).toBe(
      'https://example.com/api/agent/whoami',
    );
    expect(__testing.whoamiUrl('http://localhost:7071/api/agent/copilotkit')).toBe(
      'http://localhost:7071/api/agent/whoami',
    );
  });

  test('does NOT append "/whoami" to the runtime URL', () => {
    const result = __testing.whoamiUrl('https://example.com/api/agent/copilotkit');
    expect(result).not.toContain('copilotkit/whoami');
  });
});

describe('verifyAccess — happy path', () => {
  test('returns {status:"ok", mode:"authenticated"} on 200 with valid body', async () => {
    mockFetchOnce(async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          mode: 'authenticated',
          email: 'foo@example.com',
          name: 'Foo',
          lang: 'en',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await verifyAccess(ID_TOKEN, RUNTIME_URL);
    expect(result).toEqual({
      status: 'ok',
      mode: 'authenticated',
      email: 'foo@example.com',
      name: 'Foo',
      lang: 'en',
    });
  });

  test('returns the durable Hebrew UI language', async () => {
    mockFetchOnce(async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          mode: 'authenticated',
          email: 'foo@example.com',
          lang: 'he',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(verifyAccess(ID_TOKEN, RUNTIME_URL)).resolves.toMatchObject({
      status: 'ok',
      lang: 'he',
    });
  });

  test('returns {status:"ok", mode:"bypassed"} when the backend bypasses auth', async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ status: 'ok', mode: 'bypassed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await verifyAccess(null, RUNTIME_URL);
    expect(result).toEqual({ status: 'ok', mode: 'bypassed', lang: 'en' });
  });

  test('sends the Bearer token when one is provided', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: 'ok', mode: 'authenticated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await verifyAccess(ID_TOKEN, RUNTIME_URL);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${ID_TOKEN}`,
    );
  });
});

describe('verifyAccess — 401 (definitive rejection)', () => {
  test('returns {status:"forbidden", reason} and does NOT retry', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: 'unauthorized',
          reason: 'email_not_allowlisted',
          email: 'nope@example.com',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await verifyAccess(ID_TOKEN, RUNTIME_URL);
    expect(result).toEqual({
      status: 'forbidden',
      reason: 'email_not_allowlisted',
      email: 'nope@example.com',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('returns {status:"forbidden", reason:"unauthorized"} on 401 with no body', async () => {
    mockFetchOnce(async () => new Response('', { status: 401 }));

    const result = await verifyAccess(ID_TOKEN, RUNTIME_URL);
    expect(result.status).toBe('forbidden');
    if (result.status === 'forbidden') {
      expect(result.reason).toBe('unauthorized');
    }
  });
});

describe('verifyAccess — transient failures NEVER produce {status:"ok"}', () => {
  test('persistent 503 → {status:"unavailable", cause:"http_5xx"} after MAX_ATTEMPTS', async () => {
    const fetchSpy = vi.fn(async () => new Response('Service Unavailable', { status: 503 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const verifyPromise = verifyAccess(ID_TOKEN, RUNTIME_URL);
    await drainTimersAndPromises();
    const result = await verifyPromise;

    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.cause).toBe('http_5xx');
    }
    expect(fetchSpy).toHaveBeenCalledTimes(__testing.MAX_ATTEMPTS);
  });

  test('persistent network error → {status:"unavailable", cause:"network"}', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const verifyPromise = verifyAccess(ID_TOKEN, RUNTIME_URL);
    await drainTimersAndPromises();
    const result = await verifyPromise;

    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.cause).toBe('network');
    }
    expect(fetchSpy).toHaveBeenCalledTimes(__testing.MAX_ATTEMPTS);
  });

  test('persistent 429 → {status:"unavailable", cause:"http_429"}', async () => {
    const fetchSpy = vi.fn(async () => new Response('Too many', { status: 429 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const verifyPromise = verifyAccess(ID_TOKEN, RUNTIME_URL);
    await drainTimersAndPromises();
    const result = await verifyPromise;

    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.cause).toBe('http_429');
    }
  });

  test('5xx then 200 → eventually {status:"ok"} (retry budget recovers)', async () => {
    let attempt = 0;
    const fetchSpy = vi.fn(async () => {
      attempt++;
      if (attempt < 2) return new Response('boom', { status: 502 });
      return new Response(
        JSON.stringify({ status: 'ok', mode: 'authenticated', email: 'a@b.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const verifyPromise = verifyAccess(ID_TOKEN, RUNTIME_URL);
    await drainTimersAndPromises();
    const result = await verifyPromise;

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.email).toBe('a@b.com');
    }
  });

  test('200 with non-OK body shape is treated as transient and retried, NOT as success', async () => {
    // This guards the bug-shape where a misconfigured server returns 200
    // but with a body that does NOT match {status:'ok', mode:...}. We MUST
    // NOT silently treat that as success.
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ unexpected: 'shape' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const verifyPromise = verifyAccess(ID_TOKEN, RUNTIME_URL);
    await drainTimersAndPromises();
    const result = await verifyPromise;

    expect(result.status).not.toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(__testing.MAX_ATTEMPTS);
  });

  test('200 with non-JSON body is treated as transient, NOT as success', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response('<html>maintenance</html>', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const verifyPromise = verifyAccess(ID_TOKEN, RUNTIME_URL);
    await drainTimersAndPromises();
    const result = await verifyPromise;

    expect(result.status).not.toBe('ok');
  });
});

describe('verifyAccess — non-transient 4xx (not 401)', () => {
  test('404 is returned as unavailable without retrying', async () => {
    const fetchSpy = vi.fn(async () => new Response('Not Found', { status: 404 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await verifyAccess(ID_TOKEN, RUNTIME_URL);

    expect(result.status).toBe('unavailable');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
