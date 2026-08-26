// Durable staging store for agent write-tool confirmations.
//
// Pending intents live in Azure Table Storage so proposal and confirmation
// can land on different Azure Functions instances (or survive a host recycle).
// The model receives the nonce, but possession alone is insufficient:
// `confirm_write` consumes only intents whose state was changed to `approved`
// through the authenticated `/api/agent/write-decision` UI endpoint.

const { randomUUID } = require('crypto');
const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'PendingAgentWrites';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const INTENT_STATE = Object.freeze({
  STAGED: 'staged',
  APPROVED: 'approved',
});

const CONSUME_STATUS = Object.freeze({
  CONSUMED: 'consumed',
  NOT_FOUND: 'not_found',
  NOT_APPROVED: 'not_approved',
});

let tableClient;
let tableReady = false;
let lastSweepAt = 0;

function isNotFound(err) {
  return err && err.statusCode === 404;
}

function isConditionFailed(err) {
  return err && err.statusCode === 412;
}

function validateChatId(chatId) {
  if (typeof chatId !== 'number' || !Number.isFinite(chatId)) {
    throw new Error('pendingWritesStore: chatId must be a finite number');
  }
}

function validateNonce(writeNonce) {
  return typeof writeNonce === 'string' && writeNonce.length > 0;
}

function initializeTableClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      'Missing AZURE_STORAGE_CONNECTION_STRING for pending write storage',
    );
  }

  tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME);
  tableReady = false;
}

async function ensureTable() {
  if (!tableClient) {
    initializeTableClient();
  }

  if (!tableReady) {
    try {
      await tableClient.createTable();
    } catch (err) {
      if (err && err.statusCode !== 409) {
        throw err;
      }
    }
    tableReady = true;
  }
}

function partitionKeyFor(chatId) {
  return String(chatId);
}

function isExpired(entity, now = Date.now()) {
  return new Date(entity.expiresAt).getTime() <= now;
}

function entityToIntent(entity) {
  let args;
  try {
    args = entity.args ? JSON.parse(entity.args) : {};
  } catch {
    return null;
  }

  const chatId = Number.parseInt(entity.chatId, 10);
  const createdAtMs = new Date(entity.createdAt).getTime();
  const expiresAtMs = new Date(entity.expiresAt).getTime();
  if (
    !Number.isFinite(chatId) ||
    typeof entity.tool !== 'string' ||
    !entity.tool ||
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    (entity.state !== INTENT_STATE.STAGED &&
      entity.state !== INTENT_STATE.APPROVED)
  ) {
    return null;
  }

  return {
    chatId,
    tool: entity.tool,
    args,
    summary: typeof entity.summary === 'string' ? entity.summary : '',
    createdAt: entity.createdAt,
    expiresAt: entity.expiresAt,
    state: entity.state,
  };
}

async function getEntity(chatId, writeNonce) {
  await ensureTable();
  try {
    return await tableClient.getEntity(
      partitionKeyFor(chatId),
      writeNonce,
    );
  } catch (err) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }
}

async function deleteEntityConditionally(entity) {
  try {
    await tableClient.deleteEntity(entity.partitionKey, entity.rowKey, {
      etag: entity.etag,
    });

    return true;
  } catch (err) {
    if (isNotFound(err) || isConditionFailed(err)) {
      return false;
    }
    throw err;
  }
}

async function sweepExpiredPendingWrites({ now = Date.now(), force = false } = {}) {
  await ensureTable();
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) {
    return 0;
  }
  lastSweepAt = now;

  let removed = 0;
  const cutoff = new Date(now).toISOString();
  const entities = tableClient.listEntities({
    queryOptions: { filter: `expiresAt le '${cutoff}'` },
  });

  for await (const entity of entities) {
    // Double-check locally so a test fake or an eventually-consistent query
    // cannot delete an unexpired intent.
    if (isExpired(entity, now) && (await deleteEntityConditionally(entity))) {
      removed += 1;
    }
  }

  return removed;
}

async function stagePendingWrite({ chatId, tool, args, summary, ttlMs }) {
  validateChatId(chatId);
  if (typeof tool !== 'string' || tool.length === 0) {
    throw new Error('pendingWritesStore: tool must be a non-empty string');
  }

  await ensureTable();
  try {
    await sweepExpiredPendingWrites();
  } catch (err) {
    // Cleanup is best-effort; staging a valid write must remain available
    // during a transient table-query failure.
    console.error('Failed to sweep expired pending writes:', err);
  }

  const writeNonce = randomUUID();
  const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  const now = Date.now();
  const entity = {
    partitionKey: partitionKeyFor(chatId),
    rowKey: writeNonce,
    chatId: String(chatId),
    tool,
    args: JSON.stringify(args ?? {}),
    summary: typeof summary === 'string' ? summary : '',
    state: INTENT_STATE.STAGED,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };

  await tableClient.createEntity(entity);

  return writeNonce;
}

async function approvePendingWrite({ chatId, writeNonce, expectedTool }) {
  validateChatId(chatId);
  if (!validateNonce(writeNonce)) {
    return null;
  }

  const entity = await getEntity(chatId, writeNonce);
  if (!entity) {
    return null;
  }
  if (isExpired(entity)) {
    await deleteEntityConditionally(entity);

    return null;
  }
  const intent = entityToIntent(entity);
  if (!intent) {
    await deleteEntityConditionally(entity);

    return null;
  }
  if (
    typeof expectedTool === 'string' &&
    intent.tool !== expectedTool
  ) {
    return null;
  }
  if (entity.state === INTENT_STATE.APPROVED) {
    return intent;
  }
  if (entity.state !== INTENT_STATE.STAGED) {
    return null;
  }

  try {
    await tableClient.updateEntity(
      {
        partitionKey: entity.partitionKey,
        rowKey: entity.rowKey,
        state: INTENT_STATE.APPROVED,
        approvedAt: new Date().toISOString(),
      },
      'Merge',
      { etag: entity.etag },
    );
  } catch (err) {
    if (isNotFound(err) || isConditionFailed(err)) {
      return null;
    }
    throw err;
  }

  return { ...intent, state: INTENT_STATE.APPROVED };
}

async function cancelPendingWrite({
  chatId,
  writeNonce,
  requireExisting = false,
}) {
  validateChatId(chatId);
  if (!validateNonce(writeNonce)) {
    return false;
  }

  await ensureTable();
  try {
    // Cancellation is a winning invalidation. A concurrent approval may
    // update the ETag between read and delete; wildcard deletion guarantees
    // an acknowledged Cancel cannot leave an approved intent consumable.
    await tableClient.deleteEntity(partitionKeyFor(chatId), writeNonce, {
      etag: '*',
    });
  } catch (err) {
    if (isNotFound(err)) {
      return !requireExisting;
    }
    throw err;
  }

  // Idempotent: already expired/cancelled is still safely cancelled.
  return true;
}

async function consumeApprovedPendingWrite({ chatId, writeNonce }) {
  if (
    typeof chatId !== 'number' ||
    !Number.isFinite(chatId) ||
    !validateNonce(writeNonce)
  ) {
    return { status: CONSUME_STATUS.NOT_FOUND };
  }

  const entity = await getEntity(chatId, writeNonce);
  if (!entity) {
    return { status: CONSUME_STATUS.NOT_FOUND };
  }
  if (isExpired(entity)) {
    await deleteEntityConditionally(entity);

    return { status: CONSUME_STATUS.NOT_FOUND };
  }
  if (entity.state !== INTENT_STATE.APPROVED) {
    return { status: CONSUME_STATUS.NOT_APPROVED };
  }

  const intent = entityToIntent(entity);
  if (!intent) {
    await deleteEntityConditionally(entity);

    return { status: CONSUME_STATUS.NOT_FOUND };
  }

  // ETag-protected delete is the atomic single-use boundary. Two Function
  // instances can read the same approved entity, but only one can delete it
  // with the matching ETag and proceed to commit.
  if (!(await deleteEntityConditionally(entity))) {
    return { status: CONSUME_STATUS.NOT_FOUND };
  }

  return { status: CONSUME_STATUS.CONSUMED, intent };
}

async function peekPendingWrite({ chatId, writeNonce }) {
  if (
    typeof chatId !== 'number' ||
    !Number.isFinite(chatId) ||
    !validateNonce(writeNonce)
  ) {
    return null;
  }

  const entity = await getEntity(chatId, writeNonce);
  if (!entity) {
    return null;
  }
  if (isExpired(entity)) {
    await deleteEntityConditionally(entity);

    return null;
  }

  return entityToIntent(entity);
}

function setTableClientForTests(client) {
  tableClient = client;
  tableReady = true;
  lastSweepAt = 0;
}

function resetForTests() {
  tableClient = undefined;
  tableReady = false;
  lastSweepAt = 0;
}

module.exports = {
  stagePendingWrite,
  approvePendingWrite,
  cancelPendingWrite,
  consumeApprovedPendingWrite,
  peekPendingWrite,
  sweepExpiredPendingWrites,
  setTableClientForTests,
  resetForTests,
  DEFAULT_TTL_MS,
  INTENT_STATE,
  CONSUME_STATUS,
};
