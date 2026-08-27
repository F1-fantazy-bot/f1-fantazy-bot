const { randomUUID } = require('crypto');
const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'UserMutationLocks';
const PARTITION_KEY = 'User';
const LEASE_TTL_MS = 5 * 60 * 1000;
const ACQUIRE_TIMEOUT_MS = 10 * 1000;
const RETRY_DELAY_MS = 75;

let tableClient;
let tableReady = false;

function getClient() {
  if (!tableClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        'Missing AZURE_STORAGE_CONNECTION_STRING for user mutation locks',
      );
    }
    tableClient = TableClient.fromConnectionString(
      connectionString,
      TABLE_NAME,
    );
  }

  return tableClient;
}

async function ensureTable() {
  const client = getClient();
  if (!tableReady) {
    await client.createTable().catch(() => {});
    tableReady = true;
  }

  return client;
}

function isConflict(error) {
  return error?.statusCode === 409 || error?.statusCode === 412;
}

function isNotFound(error) {
  return error?.statusCode === 404;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryAcquire(client, chatId, owner) {
  const rowKey = String(chatId);
  const now = Date.now();
  const entity = {
    partitionKey: PARTITION_KEY,
    rowKey,
    owner,
    expiresAt: new Date(now + LEASE_TTL_MS).toISOString(),
  };

  try {
    await client.createEntity(entity);

    return true;
  } catch (error) {
    if (!isConflict(error)) {
      throw error;
    }
  }

  let existing;
  try {
    existing = await client.getEntity(PARTITION_KEY, rowKey);
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
  if (Date.parse(existing.expiresAt) > now) {
    return false;
  }

  try {
    await client.updateEntity(entity, 'Replace', {
      etag: existing.etag,
    });

    return true;
  } catch (error) {
    if (isConflict(error) || isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

async function acquireUserMutationLock(chatId) {
  const client = await ensureTable();
  const owner = randomUUID();
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await tryAcquire(client, chatId, owner)) {
      return { client, chatId, owner };
    }
    await delay(RETRY_DELAY_MS);
  }

  throw new Error(`Timed out acquiring user mutation lock for ${chatId}`);
}

async function releaseUserMutationLock({ client, chatId, owner }) {
  const rowKey = String(chatId);
  try {
    const existing = await client.getEntity(PARTITION_KEY, rowKey);
    if (existing.owner !== owner) {
      return false;
    }
    await client.deleteEntity(PARTITION_KEY, rowKey, {
      etag: existing.etag,
    });

    return true;
  } catch (error) {
    if (isNotFound(error) || isConflict(error)) {
      return false;
    }
    throw error;
  }
}

async function withUserMutationLock(chatId, operation) {
  // Unit tests inject storage behavior at the service boundary. The lock has
  // its own focused tests; bypassing external Azure here keeps every caller's
  // unit tests deterministic.
  if (process.env.NODE_ENV === 'test') {
    return await operation();
  }

  const lock = await acquireUserMutationLock(chatId);
  try {
    return await operation();
  } finally {
    try {
      await releaseUserMutationLock(lock);
    } catch (error) {
      console.error(
        `Failed to release user mutation lock for ${chatId}:`,
        error,
      );
    }
  }
}

function setTableClientForTests(client) {
  tableClient = client;
  tableReady = true;
}

function resetForTests() {
  tableClient = undefined;
  tableReady = false;
}

module.exports = {
  withUserMutationLock,
  acquireUserMutationLock,
  releaseUserMutationLock,
  setTableClientForTests,
  resetForTests,
  LEASE_TTL_MS,
  ACQUIRE_TIMEOUT_MS,
};
