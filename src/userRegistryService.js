// User Registry Service
// Tracks all users who interact with the bot in Azure Table Storage.
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
 * Preserves `firstSeen` if the user already exists, updates `lastSeen` on every call.
 * Errors are caught and logged — this function never throws.
 * @param {number} chatId - The chat ID of the user
 * @param {string} chatName - The display name of the user/chat
 */
async function upsertUser(chatId, chatName) {
  try {
    await ensureTable();

    const rowKey = String(chatId);
    const now = new Date().toISOString();

    // Try to read existing entity to preserve firstSeen
    let firstSeen = now;

    try {
      const existing = await tableClient.getEntity(PARTITION_KEY, rowKey);
      firstSeen = existing.firstSeen || now;
    } catch {
      // Entity doesn't exist yet — firstSeen will be now
    }

    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey,
      chatName,
      firstSeen,
      lastSeen: now,
    };

    await tableClient.upsertEntity(entity);
  } catch (error) {
    console.error('Error upserting user in registry:', error.message);
  }
}

/**
 * List all registered users.
 * @returns {Promise<Array<{chatId: string, chatName: string, firstSeen: string, lastSeen: string}>>}
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
    });
  }

  return users;
}

module.exports = {
  upsertUser,
  listAllUsers,
};
