// In-process staging store for write-tool confirmations.
//
// Why this exists
// ---------------
// Every write tool on the agent uses a two-call protocol:
//   1. The LLM calls e.g. `follow_league({ leagueCode: 'ABC' })`. The
//      tool stages the intent here and returns `{ status:
//      'confirmation_required', writeNonce: '…' }`. NO side effect.
//   2. The frontend renders `<WriteConfirmCard>`. On user "Yes", the
//      UI appends a chat message with the writeNonce. The LLM then
//      calls `confirm_write({ writeNonce })`, which `consume`s the
//      pending intent (single-use) and invokes the original service.
//
// The nonce closes a safety gap that a pure `confirmed: boolean`
// argument cannot — the LLM never gets to choose the nonce itself;
// it can only echo a nonce that came from a prior propose call.
//
// Scope & limitations
// -------------------
// - This store lives in the agent process memory only. It is NOT
//   shared across function-app instances. Acceptable because a
//   confirm flow only needs to survive one chat turn (seconds).
// - Single-use: `consume` deletes the intent on read. Prevents
//   double-execution if the model retries `confirm_write`.
// - TTL: each intent auto-expires (default 5 minutes). Past that,
//   `consume` returns `null` and the user must propose again.
// - Per-chatId isolation: intents are keyed by `{ chatId, nonce }`.
//   `consume({ chatId, writeNonce })` rejects nonces that belong to
//   a different chatId, so a leaked nonce cannot be replayed by
//   another user.

const { randomUUID } = require('crypto');

const DEFAULT_TTL_MS = 5 * 60 * 1000;

// Map<chatId, Map<nonce, intent>>
const store = new Map();

function nowMs() {
  return Date.now();
}

function getChatBucket(chatId) {
  let bucket = store.get(chatId);
  if (!bucket) {
    bucket = new Map();
    store.set(chatId, bucket);
  }

  return bucket;
}

function purgeExpired(bucket, now) {
  for (const [nonce, intent] of bucket.entries()) {
    if (intent.expiresAt <= now) {
      bucket.delete(nonce);
    }
  }
}

function stagePendingWrite({ chatId, tool, args, summary, ttlMs }) {
  if (typeof chatId !== 'number' || !Number.isFinite(chatId)) {
    throw new Error('pendingWritesStore.stage: chatId must be a finite number');
  }
  if (typeof tool !== 'string' || tool.length === 0) {
    throw new Error('pendingWritesStore.stage: tool must be a non-empty string');
  }

  const writeNonce = randomUUID();
  const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const bucket = getChatBucket(chatId);
  purgeExpired(bucket, nowMs());

  bucket.set(writeNonce, {
    chatId,
    tool,
    args: args ?? {},
    summary: typeof summary === 'string' ? summary : '',
    createdAt: nowMs(),
    expiresAt: nowMs() + ttl,
  });

  return writeNonce;
}

function consumePendingWrite({ chatId, writeNonce }) {
  if (typeof chatId !== 'number' || !Number.isFinite(chatId)) {
    return null;
  }
  if (typeof writeNonce !== 'string' || writeNonce.length === 0) {
    return null;
  }

  const bucket = store.get(chatId);
  if (!bucket) {
    return null;
  }

  purgeExpired(bucket, nowMs());

  const intent = bucket.get(writeNonce);
  if (!intent) {
    return null;
  }

  // Single-use: delete on read.
  bucket.delete(writeNonce);
  if (bucket.size === 0) {
    store.delete(chatId);
  }

  return intent;
}

function peekPendingWrite({ chatId, writeNonce }) {
  const bucket = store.get(chatId);
  if (!bucket) {
    return null;
  }

  purgeExpired(bucket, nowMs());
  const intent = bucket.get(writeNonce);

  return intent ? { ...intent } : null;
}

function resetForTests() {
  store.clear();
}

module.exports = {
  stagePendingWrite,
  consumePendingWrite,
  peekPendingWrite,
  resetForTests,
  DEFAULT_TTL_MS,
};
