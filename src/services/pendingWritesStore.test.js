const {
  stagePendingWrite,
  consumePendingWrite,
  peekPendingWrite,
  resetForTests,
  DEFAULT_TTL_MS,
} = require('./pendingWritesStore');

beforeEach(() => {
  resetForTests();
});

describe('stagePendingWrite', () => {
  test('returns a non-empty nonce string', () => {
    const nonce = stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
      summary: 'Change language to Hebrew.',
    });
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(0);
  });

  test('different intents get different nonces', () => {
    const a = stagePendingWrite({ chatId: 1, tool: 'set_language', args: { lang: 'he' } });
    const b = stagePendingWrite({ chatId: 1, tool: 'set_language', args: { lang: 'en' } });
    expect(a).not.toBe(b);
  });

  test('throws on non-numeric chatId', () => {
    expect(() =>
      stagePendingWrite({ chatId: 'nope', tool: 'set_language' }),
    ).toThrow(/chatId must be a finite number/);
  });

  test('throws on missing tool name', () => {
    expect(() => stagePendingWrite({ chatId: 1, tool: '' })).toThrow(
      /tool must be a non-empty string/,
    );
  });
});

describe('consumePendingWrite', () => {
  test('returns the staged intent verbatim', () => {
    const nonce = stagePendingWrite({
      chatId: 42,
      tool: 'follow_league',
      args: { leagueCode: 'ABC' },
      summary: 'Follow league ABC.',
    });
    const intent = consumePendingWrite({ chatId: 42, writeNonce: nonce });
    expect(intent).toMatchObject({
      chatId: 42,
      tool: 'follow_league',
      args: { leagueCode: 'ABC' },
      summary: 'Follow league ABC.',
    });
    expect(typeof intent.createdAt).toBe('number');
    expect(typeof intent.expiresAt).toBe('number');
  });

  test('is single-use — the second consume returns null', () => {
    const nonce = stagePendingWrite({ chatId: 1, tool: 'set_language', args: { lang: 'he' } });
    expect(consumePendingWrite({ chatId: 1, writeNonce: nonce })).not.toBeNull();
    expect(consumePendingWrite({ chatId: 1, writeNonce: nonce })).toBeNull();
  });

  test('rejects nonces from other chats', () => {
    const nonce = stagePendingWrite({ chatId: 1, tool: 'set_language', args: { lang: 'he' } });
    // Different chatId — must NOT consume.
    expect(consumePendingWrite({ chatId: 2, writeNonce: nonce })).toBeNull();
    // Original chat still can — proves the intent is intact.
    expect(consumePendingWrite({ chatId: 1, writeNonce: nonce })).not.toBeNull();
  });

  test('returns null for unknown nonce', () => {
    expect(consumePendingWrite({ chatId: 1, writeNonce: 'no-such-nonce' })).toBeNull();
  });

  test('returns null for bad inputs', () => {
    expect(consumePendingWrite({ chatId: 'x', writeNonce: 'y' })).toBeNull();
    expect(consumePendingWrite({ chatId: 1, writeNonce: '' })).toBeNull();
    expect(consumePendingWrite({ chatId: 1, writeNonce: null })).toBeNull();
  });

  test('expired intents are not returned', () => {
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      const nonce = stagePendingWrite({ chatId: 1, tool: 'set_language', args: { lang: 'he' } });
      fakeNow += DEFAULT_TTL_MS + 1;
      expect(consumePendingWrite({ chatId: 1, writeNonce: nonce })).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  test('custom ttlMs takes effect', () => {
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      const nonce = stagePendingWrite({
        chatId: 1,
        tool: 'set_language',
        args: { lang: 'he' },
        ttlMs: 50,
      });
      fakeNow += 51;
      expect(consumePendingWrite({ chatId: 1, writeNonce: nonce })).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  test('staging a new intent purges previously-expired ones for the same chat', () => {
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      const stale = stagePendingWrite({
        chatId: 1,
        tool: 'set_language',
        args: { lang: 'he' },
        ttlMs: 10,
      });
      fakeNow += 100;
      stagePendingWrite({ chatId: 1, tool: 'set_language', args: { lang: 'en' } });
      // The stale nonce should be gone even though we never consumed it.
      expect(consumePendingWrite({ chatId: 1, writeNonce: stale })).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('peekPendingWrite', () => {
  test('returns a copy without consuming', () => {
    const nonce = stagePendingWrite({
      chatId: 7,
      tool: 'set_language',
      args: { lang: 'he' },
      summary: 'Change language.',
    });
    const peek1 = peekPendingWrite({ chatId: 7, writeNonce: nonce });
    const peek2 = peekPendingWrite({ chatId: 7, writeNonce: nonce });
    expect(peek1.tool).toBe('set_language');
    expect(peek2.tool).toBe('set_language');
    // Still consumable afterwards.
    expect(consumePendingWrite({ chatId: 7, writeNonce: nonce })).not.toBeNull();
  });
});
