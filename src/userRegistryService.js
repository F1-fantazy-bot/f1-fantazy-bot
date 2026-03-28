// User Registry Service
// Tracks all users who interact with the bot in Azure Table Storage.
// Also stores user attributes (language preferences, nicknames, etc.) using a generic merge pattern.
// Uses fire-and-forget pattern for upsertUser — errors are logged but never thrown to avoid blocking message handling.
// Uses Azure Table Storage "Merge" mode so that only the fields being updated are written —
// all other existing fields are automatically preserved without needing to read them first.

const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'UserRegistry';
const PARTITION_KEY = 'User';

// Azure Table Storage system fields that should be excluded when returning user data
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

/**
 * Initialize the Azure Table Storage client.
 * Uses the same connection string as the rest of the app (AZURE_STORAGE_CONNECTION_STRING).
 */
function initializeTableClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error(
      'Missing AZURE_STORAGE_CONNECTION_STRING for user registry storage',
    );
  }

  tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME);
  tableReady = false;
}

/**
 * Ensure the table client is initialized and the table exists.
 * The createTable call is only made once per process lifetime.
 */
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

/**
 * Upsert a user in the registry.
 * Uses Azure Table Storage "Merge" mode — only sends chatName and lastSeen (and firstSeen for new users).
 * All other existing attributes (lang, nickname, future fields) are automatically preserved by Merge mode.
 * Errors are caught and logged — this function never throws.
 * @param {number} chatId - The chat ID of the user
 * @param {string} chatName - The display name of the user/chat
 */
async function upsertUser(chatId, chatName) {
  try {
    await ensureTable();

    const rowKey = String(chatId);
    const now = new Date().toISOString();

    // Check if user exists to set firstSeen only for new users
    let isNewUser = false;

    try {
      await tableClient.getEntity(PARTITION_KEY, rowKey);
    } catch (err) {
      if (err.statusCode === 404) {
        isNewUser = true;
      } else {
        // Real storage error — re-throw so the outer catch logs it
        throw err;
      }
    }

    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey,
      chatName,
      lastSeen: now,
    };

    if (isNewUser) {
      entity.firstSeen = now;
    }

    await tableClient.upsertEntity(entity, 'Merge');
  } catch (error) {
    console.error('Error upserting user in registry:', error.message);
  }
}

/**
 * Update one or more attributes for a user in the registry.
 * Uses Azure Table Storage "Merge" mode — only the provided attributes are written,
 * all other existing fields are automatically preserved.
 * @param {number|string} chatId - The chat ID of the user
 * @param {Object} attributes - Key-value pairs of attributes to update (e.g., { lang: 'he' })
 */
async function updateUserAttributes(chatId, attributes) {
  await ensureTable();

  const rowKey = String(chatId);
  const entries = Object.entries(attributes);
  const entriesToDelete = entries.filter(([, value]) => value === null);
  const entriesToUpsert = entries.filter(([, value]) => value !== null);

  if (entriesToDelete.length === 0) {
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey,
      ...Object.fromEntries(entriesToUpsert),
    };

    await tableClient.upsertEntity(entity, 'Merge');

    return;
  }

  let existingEntity = {
    partitionKey: PARTITION_KEY,
    rowKey,
  };

  try {
    existingEntity = await tableClient.getEntity(PARTITION_KEY, rowKey);
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
  }

  const entity = {
    ...existingEntity,
    partitionKey: PARTITION_KEY,
    rowKey,
    ...Object.fromEntries(entriesToUpsert),
  };

  for (const [key] of entriesToDelete) {
    delete entity[key];
  }

  await tableClient.upsertEntity(entity, 'Replace');
}

/**
 * Get a single user by their chat ID.
 * Uses a direct Azure Table Storage point lookup (getEntity) — much more efficient than listing all users.
 * @param {number|string} chatId - The chat ID of the user to look up
 * @returns {Promise<Object|null>} User object with chatId and all stored attributes, or null if not found
 */
async function getUserById(chatId) {
  await ensureTable();

  const rowKey = String(chatId);

  try {
    const entity = await tableClient.getEntity(PARTITION_KEY, rowKey);

    const user = { chatId: entity.rowKey };

    for (const [key, value] of Object.entries(entity)) {
      if (!SYSTEM_FIELDS.has(key)) {
        user[key] = value;
      }
    }

    return user;
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }

    throw err;
  }
}

/**
 * List all registered users.
 * Returns all non-system fields from each entity, automatically including any future attributes.
 * Used by cacheInitializer to populate userCache and by admin commands to display user lists.
 * @returns {Promise<Array<Object>>} Array of user objects with chatId and all stored attributes
 */
async function listAllUsers() {
  await ensureTable();

  const users = [];

  for await (const entity of tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
  })) {
    const user = { chatId: entity.rowKey };

    for (const [key, value] of Object.entries(entity)) {
      if (!SYSTEM_FIELDS.has(key)) {
        user[key] = value;
      }
    }

    users.push(user);
  }

  return users;
}

module.exports = {
  upsertUser,
  updateUserAttributes,
  getUserById,
  listAllUsers,
};
