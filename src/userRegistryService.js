// User Registry Service
// Tracks all users who interact with the bot in Azure Table Storage.
// Also stores user language preferences (replacing the old blob-based user-settings).
// Uses fire-and-forget pattern — errors are logged but never thrown to avoid blocking message handling.

const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'UserRegistry';
const PARTITION_KEY = 'User';

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
 * Preserves `firstSeen` and `lang` if the user already exists, updates `lastSeen` on every call.
 * Errors are caught and logged — this function never throws.
 * @param {number} chatId - The chat ID of the user
 * @param {string} chatName - The display name of the user/chat
 */
async function upsertUser(chatId, chatName) {
  try {
    await ensureTable();

    const rowKey = String(chatId);
    const now = new Date().toISOString();

    // Try to read existing entity to preserve firstSeen and lang
    let firstSeen = now;
    let lang;

    try {
      const existing = await tableClient.getEntity(PARTITION_KEY, rowKey);
      firstSeen = existing.firstSeen || now;
      lang = existing.lang;
    } catch (err) {
      if (err.statusCode !== 404) {
        // Real storage error — re-throw so the outer catch logs it
        throw err;
      }
      // Entity doesn't exist yet — firstSeen will be now, lang will be undefined
    }

    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey,
      chatName,
      firstSeen,
      lastSeen: now,
    };

    if (lang) {
      entity.lang = lang;
    }

    await tableClient.upsertEntity(entity);
  } catch (error) {
    console.error('Error upserting user in registry:', error.message);
  }
}

/**
 * Update a user's language preference in the registry.
 * Performs a read-merge-write to preserve all other fields.
 * @param {number|string} chatId - The chat ID of the user
 * @param {string} lang - The language code (e.g., 'en', 'he')
 */
async function updateUserLanguage(chatId, lang) {
  await ensureTable();

  const rowKey = String(chatId);

  // Read existing entity to preserve other fields
  let existing;
  try {
    existing = await tableClient.getEntity(PARTITION_KEY, rowKey);
  } catch (err) {
    if (err.statusCode !== 404) {
      // Real storage error — propagate it
      throw err;
    }
    // Entity doesn't exist — create a minimal one
    existing = {};
  }

  const now = new Date().toISOString();

  const entity = {
    partitionKey: PARTITION_KEY,
    rowKey,
    chatName: existing.chatName || '',
    firstSeen: existing.firstSeen || now,
    lastSeen: existing.lastSeen || now,
    lang,
  };

  await tableClient.upsertEntity(entity);
}

/**
 * List all registered users.
 * @returns {Promise<Array<{chatId: string, chatName: string, firstSeen: string, lastSeen: string, lang: string|undefined}>>}
 */
async function listAllUsers() {
  await ensureTable();

  const users = [];

  for await (const entity of tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
  })) {
    users.push({
      chatId: entity.rowKey,
      chatName: entity.chatName,
      firstSeen: entity.firstSeen,
      lastSeen: entity.lastSeen,
      lang: entity.lang,
    });
  }

  return users;
}

/**
 * List all user language preferences from the registry.
 * Returns a mapping of chatId → lang code, used by cacheInitializer to populate languageCache.
 * @returns {Promise<Object>} mapping of chatId (string) to language code (string)
 */
async function listAllUserLanguages() {
  await ensureTable();

  const languages = {};

  for await (const entity of tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
  })) {
    if (entity.lang) {
      languages[entity.rowKey] = entity.lang;
    }
  }

  return languages;
}

module.exports = {
  upsertUser,
  updateUserLanguage,
  listAllUsers,
  listAllUserLanguages,
};
