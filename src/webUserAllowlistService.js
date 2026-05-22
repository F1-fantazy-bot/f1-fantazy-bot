// Web user allowlist — maps Google emails to the Telegram chatId the
// agent should act as for that user.
//
// Backed by Azure Table Storage (table: `WebUserAllowlist`). Uses the
// same `AZURE_STORAGE_CONNECTION_STRING` as the rest of the app. Single
// partition (`'WebUser'`); rowKey is the lowercased Google email so
// `getAllowedUserByEmail` is an O(1) point lookup.
//
// Until the agent has its own write actions, every allowlisted user
// MUST have a `chatId` so the agent can serve their existing Telegram-
// side data (teams, leagues, live score, …). When write actions land
// the `chatId` field becomes optional — see the plan for the cutover
// path.

const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'WebUserAllowlist';
const PARTITION_KEY = 'WebUser';

const SYSTEM_FIELDS = new Set([
  'partitionKey',
  'rowKey',
  'etag',
  'timestamp',
  'odata.etag',
  'odata.metadata',
]);

let tableClient;
let tableReady = false;

function initializeTableClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error(
      'Missing AZURE_STORAGE_CONNECTION_STRING for web user allowlist storage',
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
    await tableClient.createTable().catch(() => {
      // Table already exists — ignore
    });
    tableReady = true;
  }
}

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new Error('Email must be a string');
  }

  return email.trim().toLowerCase();
}

function entityToUser(entity) {
  const user = { email: entity.rowKey };

  for (const [key, value] of Object.entries(entity)) {
    if (!SYSTEM_FIELDS.has(key)) {
      user[key] = value;
    }
  }

  return user;
}

/**
 * Look up an allowed user by their Google email (case-insensitive).
 * @param {string} email
 * @returns {Promise<{email: string, chatId?: string, addedBy?: string, addedAt?: string}|null>}
 */
async function getAllowedUserByEmail(email) {
  await ensureTable();

  const rowKey = normalizeEmail(email);

  try {
    const entity = await tableClient.getEntity(PARTITION_KEY, rowKey);

    return entityToUser(entity);
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }

    throw err;
  }
}

/**
 * Upsert an allowlist entry. `chatId` is required for v1 (read-only
 * agent) but stored as a string so future writers can store an
 * email-only entry.
 *
 * @param {string} email
 * @param {number|string} chatId
 * @param {number|string} addedBy - chatId of the admin adding the entry
 */
async function addAllowedUser(email, chatId, addedBy) {
  await ensureTable();

  const rowKey = normalizeEmail(email);
  const now = new Date().toISOString();

  const entity = {
    partitionKey: PARTITION_KEY,
    rowKey,
    chatId: String(chatId),
    addedBy: String(addedBy),
    addedAt: now,
  };

  await tableClient.upsertEntity(entity, 'Merge');
}

/**
 * Delete an allowlist entry. Idempotent — missing rows are a no-op.
 * @param {string} email
 */
async function removeAllowedUser(email) {
  await ensureTable();

  const rowKey = normalizeEmail(email);

  try {
    await tableClient.deleteEntity(PARTITION_KEY, rowKey);
  } catch (err) {
    if (err.statusCode === 404) {
      return;
    }

    throw err;
  }
}

/**
 * List all allowed users.
 * @returns {Promise<Array<{email: string, chatId?: string, addedBy?: string, addedAt?: string}>>}
 */
async function listAllowedUsers() {
  await ensureTable();

  const users = [];

  for await (const entity of tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
  })) {
    users.push(entityToUser(entity));
  }

  return users;
}

module.exports = {
  getAllowedUserByEmail,
  addAllowedUser,
  removeAllowedUser,
  listAllowedUsers,
};
