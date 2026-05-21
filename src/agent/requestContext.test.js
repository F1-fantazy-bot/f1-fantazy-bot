const {
  runWithRequestContext,
  getRequestContext,
} = require('./requestContext');

describe('requestContext', () => {
  test('getRequestContext returns undefined when no context is active', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  test('runWithRequestContext exposes the same store to synchronous descendants', async () => {
    await runWithRequestContext({ chatId: 42 }, async () => {
      expect(getRequestContext()).toEqual({ chatId: 42 });
    });
  });

  test('store is preserved across awaits', async () => {
    await runWithRequestContext({ chatId: 1, email: 'a@example.com' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(getRequestContext()).toEqual({
        chatId: 1,
        email: 'a@example.com',
      });
    });
  });

  test('concurrent contexts do not bleed into each other', async () => {
    const seen = [];

    async function captureAfterDelay(label, ms) {
      await new Promise((r) => setTimeout(r, ms));
      seen.push({ label, ctx: getRequestContext() });
    }

    await Promise.all([
      runWithRequestContext({ chatId: 1 }, () => captureAfterDelay('a', 20)),
      runWithRequestContext({ chatId: 2 }, () => captureAfterDelay('b', 10)),
      runWithRequestContext({ chatId: 3 }, () => captureAfterDelay('c', 30)),
    ]);

    const byLabel = Object.fromEntries(seen.map((e) => [e.label, e.ctx]));
    expect(byLabel.a).toEqual({ chatId: 1 });
    expect(byLabel.b).toEqual({ chatId: 2 });
    expect(byLabel.c).toEqual({ chatId: 3 });
  });

  test('store is gone after the callback resolves', async () => {
    await runWithRequestContext({ chatId: 99 }, async () => {
      expect(getRequestContext()).toEqual({ chatId: 99 });
    });
    expect(getRequestContext()).toBeUndefined();
  });

  test('throws from callback do not leak the context outwards', async () => {
    await expect(
      runWithRequestContext({ chatId: 7 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getRequestContext()).toBeUndefined();
  });
});
