// Durable, job-scoped lease for manual Logic App trigger requests.
//
// A confirmation nonce prevents reusing one proposal, but two independent
// confirmations can still land on separate Function workers. This Azure Table
// row is the cross-process boundary: one active/recent request per trigger
// job, with a safe public run reference that can be shown to administrators.

const { randomUUID } = require('crypto');
const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'ManualTriggerLeases';
const PARTITION_KEY = 'ManualTrigger';
const LEASE_TTL_MS = 5 * 60 * 1000;
const MAX_ACQUIRE_ATTEMPTS = 3;

let tableClient;
let tableReady = false;

function isConflict(error) {
  return error?.statusCode === 409 || error?.statusCode === 412;
}

function isNotFound(error) {
  return error?.statusCode === 404;
}

function createRunReference(triggerId) {
  return `${triggerId}-${randomUUID().slice(0, 8)}`;
}

function getClient() {
  if (!tableClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        'Missing AZURE_STORAGE_CONNECTION_STRING for manual trigger leases',
      );
    }
    tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME);
  }

  return tableClient;
}

async function ensureTable() {
  const client = getClient();
  if (!tableReady) {
    try {
      await client.createTable();
    } catch (error) {
      if (!isConflict(error)) {
        throw error;
      }
    }
    tableReady = true;
  }

  return client;
}

function isActive(entity, now = Date.now()) {
  return Date.parse(entity?.expiresAt || '') > now;
}

function toLease(entity) {
  return {
    triggerId: entity.rowKey,
    owner: entity.owner,
    runReference: entity.runReference,
    expiresAt: entity.expiresAt,
  };
}

function newEntity(triggerId, now = Date.now()) {
  return {
    partitionKey: PARTITION_KEY,
    rowKey: triggerId,
    owner: randomUUID(),
    runReference: createRunReference(triggerId),
    state: 'running',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LEASE_TTL_MS).toISOString(),
  };
}

async function acquireManualTriggerLease(triggerId, { now = Date.now() } = {}) {
  if (typeof triggerId !== 'string' || triggerId.length === 0) {
    throw new Error('manualTriggerLeaseService: triggerId is required');
  }

  const client = await ensureTable();
  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    const candidate = newEntity(triggerId, now);
    try {
      await client.createEntity(candidate);

      return { status: 'acquired', lease: toLease(candidate) };
    } catch (error) {
      if (!isConflict(error)) {
        throw error;
      }
    }

    let existing;
    try {
      existing = await client.getEntity(PARTITION_KEY, triggerId);
    } catch (error) {
      if (isNotFound(error)) {
        continue;
      }
      throw error;
    }

    if (isActive(existing, now)) {
      return { status: 'deduplicated', lease: toLease(existing) };
    }

    try {
      await client.updateEntity(candidate, 'Replace', { etag: existing.etag });

      return { status: 'acquired', lease: toLease(candidate) };
    } catch (error) {
      if (!isConflict(error) && !isNotFound(error)) {
        throw error;
      }
    }
  }

  throw new Error('Unable to acquire manual trigger lease after retries');
}

async function markManualTriggerLease(lease, state) {
  if (!lease || typeof state !== 'string' || state.length === 0) {
    return false;
  }

  const client = await ensureTable();
  try {
    const existing = await client.getEntity(PARTITION_KEY, lease.triggerId);
    if (existing.owner !== lease.owner) {
      return false;
    }
    await client.updateEntity(
      {
        partitionKey: PARTITION_KEY,
        rowKey: lease.triggerId,
        state,
        settledAt: new Date().toISOString(),
      },
      'Merge',
      { etag: existing.etag },
    );

    return true;
  } catch (error) {
    if (isConflict(error) || isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

async function releaseManualTriggerLease(lease) {
  if (!lease) {
    return false;
  }

  const client = await ensureTable();
  try {
    const existing = await client.getEntity(PARTITION_KEY, lease.triggerId);
    if (existing.owner !== lease.owner) {
      return false;
    }
    await client.deleteEntity(PARTITION_KEY, lease.triggerId, {
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

function setTableClientForTests(client) {
  tableClient = client;
  tableReady = true;
}

function resetForTests() {
  tableClient = undefined;
  tableReady = false;
}

module.exports = {
  TABLE_NAME,
  PARTITION_KEY,
  LEASE_TTL_MS,
  acquireManualTriggerLease,
  markManualTriggerLease,
  releaseManualTriggerLease,
  setTableClientForTests,
  resetForTests,
};
