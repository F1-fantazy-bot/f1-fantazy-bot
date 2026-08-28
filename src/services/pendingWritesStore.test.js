const {
  stagePendingWrite,
  approvePendingWrite,
  cancelPendingWrite,
  consumeApprovedPendingWrite,
  peekPendingWrite,
  sweepExpiredPendingWrites,
  setTableClientForTests,
  resetForTests,
  INTENT_STATE,
  CONSUME_STATUS,
} = require('./pendingWritesStore');

function storageError(statusCode) {
  const err = new Error(`storage ${statusCode}`);
  err.statusCode = statusCode;

  return err;
}

class FakeTableClient {
  constructor(shared = new Map()) {
    this.shared = shared;
  }

  async createTable() {}

  key(partitionKey, rowKey) {
    return `${partitionKey}::${rowKey}`;
  }

  clone(entity) {
    return JSON.parse(JSON.stringify(entity));
  }

  async createEntity(entity) {
    const key = this.key(entity.partitionKey, entity.rowKey);
    if (this.shared.has(key)) {throw storageError(409);}
    this.shared.set(key, { ...this.clone(entity), etag: String(++etagCounter) });
  }

  async getEntity(partitionKey, rowKey) {
    const entity = this.shared.get(this.key(partitionKey, rowKey));
    if (!entity) {throw storageError(404);}

    return this.clone(entity);
  }

  async updateEntity(entity, mode, options = {}) {
    const key = this.key(entity.partitionKey, entity.rowKey);
    const current = this.shared.get(key);
    if (!current) {throw storageError(404);}
    if (
      options.etag &&
      options.etag !== '*' &&
      options.etag !== current.etag
    ) {
      throw storageError(412);
    }
    const next =
      mode === 'Merge'
        ? { ...current, ...this.clone(entity) }
        : this.clone(entity);
    next.etag = String(++etagCounter);
    this.shared.set(key, next);
  }

  async deleteEntity(partitionKey, rowKey, options = {}) {
    const key = this.key(partitionKey, rowKey);
    const current = this.shared.get(key);
    if (!current) {throw storageError(404);}
    if (
      options.etag &&
      options.etag !== '*' &&
      options.etag !== current.etag
    ) {
      throw storageError(412);
    }
    this.shared.delete(key);
  }

  async *listEntities() {
    for (const entity of this.shared.values()) {
      yield this.clone(entity);
    }
  }
}

let shared;
let client;
let etagCounter;

beforeEach(() => {
  resetForTests();
  etagCounter = 0;
  shared = new Map();
  client = new FakeTableClient(shared);
  setTableClientForTests(client);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('stagePendingWrite', () => {
  test('persists a staged intent and returns a unique nonce', async () => {
    const a = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
      summary: 'Change language.',
    });
    const b = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'en' },
    });

    expect(a).not.toBe(b);
    await expect(
      peekPendingWrite({ chatId: 1, writeNonce: a }),
    ).resolves.toMatchObject({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
      summary: 'Change language.',
      state: INTENT_STATE.STAGED,
    });
  });

  test('rejects invalid chatId and tool names', async () => {
    await expect(
      stagePendingWrite({ chatId: 'nope', tool: 'set_language' }),
    ).rejects.toThrow(/chatId must be a finite number/);
    await expect(
      stagePendingWrite({ chatId: 1, tool: '' }),
    ).rejects.toThrow(/tool must be a non-empty string/);
  });

  test('survives a process/client replacement', async () => {
    const nonce = await stagePendingWrite({
      chatId: 42,
      tool: 'set_language',
      args: { lang: 'he' },
    });

    // New client instance, same durable backing store: models Azure routing the
    // confirmation turn to a different Function worker.
    setTableClientForTests(new FakeTableClient(shared));

    await expect(
      peekPendingWrite({ chatId: 42, writeNonce: nonce }),
    ).resolves.toMatchObject({ tool: 'set_language' });
  });
});

describe('approval and cancellation', () => {
  test('an unapproved nonce cannot be consumed', async () => {
    const nonce = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
    });

    await expect(
      consumeApprovedPendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toEqual({ status: CONSUME_STATUS.NOT_APPROVED });
    // The model's premature attempt does not destroy the intent; the real UI
    // can still approve it.
    await expect(
      approvePendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toMatchObject({ state: INTENT_STATE.APPROVED });
  });

  test('approval is isolated by chatId', async () => {
    const nonce = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
    });

    await expect(
      approvePendingWrite({ chatId: 2, writeNonce: nonce }),
    ).resolves.toBeNull();
    await expect(
      approvePendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toMatchObject({ chatId: 1 });
  });

  test('expectedTool prevents an unsupported intent from becoming approved', async () => {
    const nonce = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
    });

    await expect(
      approvePendingWrite({
        chatId: 1,
        writeNonce: nonce,
        expectedTool: 'select_team',
      }),
    ).resolves.toBeNull();
    await expect(
      consumeApprovedPendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toEqual({ status: CONSUME_STATUS.NOT_APPROVED });
  });

  test('expectedTools allows only explicitly supported direct-confirm intents', async () => {
    const reportNonce = await stagePendingWrite({
      chatId: 1,
      tool: 'report_bug',
      args: { message: 'Broken card' },
    });
    const followTeamNonce = await stagePendingWrite({
      chatId: 1,
      tool: 'follow_team',
      args: {
        action: 'add',
        leagueCode: 'ABC123',
        teamId: 'Owner_1',
      },
    });
    const unfollowLeagueNonce = await stagePendingWrite({
      chatId: 1,
      tool: 'unfollow_league',
      args: { leagueCode: 'ABC123' },
    });
    const languageNonce = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
    });
    const expectedTools = [
      'select_team',
      'follow_team',
      'unfollow_league',
      'report_bug',
    ];

    await expect(
      approvePendingWrite({
        chatId: 1,
        writeNonce: reportNonce,
        expectedTools,
      }),
    ).resolves.toMatchObject({ state: INTENT_STATE.APPROVED });
    await expect(
      approvePendingWrite({
        chatId: 1,
        writeNonce: followTeamNonce,
        expectedTools,
      }),
    ).resolves.toMatchObject({ state: INTENT_STATE.APPROVED });
    await expect(
      approvePendingWrite({
        chatId: 1,
        writeNonce: unfollowLeagueNonce,
        expectedTools,
      }),
    ).resolves.toMatchObject({ state: INTENT_STATE.APPROVED });
    await expect(
      approvePendingWrite({
        chatId: 1,
        writeNonce: languageNonce,
        expectedTools,
      }),
    ).resolves.toBeNull();
  });

  test('cancellation deletes the nonce immediately', async () => {
    const nonce = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
    });

    await expect(
      cancelPendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toBe(true);
    await expect(
      approvePendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toBeNull();
    await expect(
      consumeApprovedPendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toEqual({ status: CONSUME_STATUS.NOT_FOUND });
  });

  test('strict revocation reports when the nonce was already absent', async () => {
    const nonce = await stagePendingWrite({
      chatId: 1,
      tool: 'select_team',
      args: { teamId: 'T2' },
    });

    await expect(
      cancelPendingWrite({
        chatId: 1,
        writeNonce: nonce,
        requireExisting: true,
      }),
    ).resolves.toBe(true);
    await expect(
      cancelPendingWrite({
        chatId: 1,
        writeNonce: nonce,
        requireExisting: true,
      }),
    ).resolves.toBe(false);
  });

  test('acknowledged cancellation wins against concurrent approval', async () => {
    const nonce = await stagePendingWrite({
      chatId: 1,
      tool: 'set_language',
      args: { lang: 'he' },
    });

    const [approved, cancelled] = await Promise.all([
      approvePendingWrite({ chatId: 1, writeNonce: nonce }),
      cancelPendingWrite({ chatId: 1, writeNonce: nonce }),
    ]);

    expect(cancelled).toBe(true);
    // Approval may have linearized before the delete, but the final state must
    // always be absent once cancellation has been acknowledged.
    expect(approved === null || approved.state === INTENT_STATE.APPROVED).toBe(
      true,
    );
    await expect(
      consumeApprovedPendingWrite({ chatId: 1, writeNonce: nonce }),
    ).resolves.toEqual({ status: CONSUME_STATUS.NOT_FOUND });
  });
});

describe('consumeApprovedPendingWrite', () => {
  test('consumes an approved intent exactly once', async () => {
    const nonce = await stagePendingWrite({
      chatId: 42,
      tool: 'follow_league',
      args: { leagueCode: 'ABC' },
      summary: 'Follow league ABC.',
    });
    await approvePendingWrite({ chatId: 42, writeNonce: nonce });

    const first = await consumeApprovedPendingWrite({
      chatId: 42,
      writeNonce: nonce,
    });
    expect(first).toMatchObject({
      status: CONSUME_STATUS.CONSUMED,
      intent: {
        chatId: 42,
        tool: 'follow_league',
        args: { leagueCode: 'ABC' },
      },
    });
    await expect(
      consumeApprovedPendingWrite({ chatId: 42, writeNonce: nonce }),
    ).resolves.toEqual({ status: CONSUME_STATUS.NOT_FOUND });
  });

  test('ETag-protected delete lets only one concurrent consumer win', async () => {
    const nonce = await stagePendingWrite({
      chatId: 42,
      tool: 'set_language',
      args: { lang: 'he' },
    });
    await approvePendingWrite({ chatId: 42, writeNonce: nonce });

    const results = await Promise.all([
      consumeApprovedPendingWrite({ chatId: 42, writeNonce: nonce }),
      consumeApprovedPendingWrite({ chatId: 42, writeNonce: nonce }),
    ]);

    expect(results.filter((r) => r.status === CONSUME_STATUS.CONSUMED)).toHaveLength(1);
    expect(results.filter((r) => r.status === CONSUME_STATUS.NOT_FOUND)).toHaveLength(1);
  });

  test('expired intents cannot be approved or consumed', async () => {
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      const nonce = await stagePendingWrite({
        chatId: 1,
        tool: 'set_language',
        args: { lang: 'he' },
        ttlMs: 50,
      });
      fakeNow += 51;
      await expect(
        approvePendingWrite({ chatId: 1, writeNonce: nonce }),
      ).resolves.toBeNull();
      await expect(
        consumeApprovedPendingWrite({ chatId: 1, writeNonce: nonce }),
      ).resolves.toEqual({ status: CONSUME_STATUS.NOT_FOUND });
    } finally {
      Date.now = realNow;
    }
  });
});

describe('expired-entry sweeping', () => {
  test('removes abandoned expired entries without consuming them', async () => {
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      const stale = await stagePendingWrite({
        chatId: 1,
        tool: 'set_language',
        args: { lang: 'he' },
        ttlMs: 10,
      });
      await stagePendingWrite({
        chatId: 2,
        tool: 'set_language',
        args: { lang: 'en' },
      });
      fakeNow += 100;

      await expect(
        sweepExpiredPendingWrites({ now: fakeNow, force: true }),
      ).resolves.toBe(1);
      await expect(
        peekPendingWrite({ chatId: 1, writeNonce: stale }),
      ).resolves.toBeNull();
      expect(shared.size).toBe(1);
    } finally {
      Date.now = realNow;
    }
  });

  test('sweep failures are logged but do not block a new stage', async () => {
    const failingClient = new FakeTableClient(shared);
    failingClient.listEntities = () => {
      throw new Error('query unavailable');
    };
    setTableClientForTests(failingClient);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      stagePendingWrite({
        chatId: 1,
        tool: 'set_language',
        args: { lang: 'he' },
      }),
    ).resolves.toEqual(expect.any(String));
    expect(console.error).toHaveBeenCalledWith(
      'Failed to sweep expired pending writes:',
      expect.any(Error),
    );
  });
});
