// Centralized pending reply manager
// Stores chatId -> command ID mappings in Azure Table Storage for multi-server support.
// Handler functions are reconstructed via the pending reply registry.
// Supports optional data storage for multi-step commands (e.g., storing intermediate state).

const { TableClient } = require('@azure/data-tables');
const { resolveCommand } = require('./pendingReplyRegistry');

const TABLE_NAME = 'PendingReplies';
const PARTITION_KEY = 'PendingReply';
const TTL_MS = 60 * 60 * 1000; // 1 hour

let tableClient;
let tableReady = false;

/**
 * Initialize the Azure Table Storage client.
 * Uses the same connection string as the rest of the app (AZURE_STORAGE_CONNECTION_STRING).
 */
function initializeTableClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING for pending reply storage');
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
 * Register a pending reply for a chat.
 * Stores the command ID in Azure Table Storage so any server instance can resolve it.
 * Optionally stores additional data (as JSON) for multi-step commands.
 * @param {number} chatId
 * @param {string} commandId - The command identifier (must exist in pendingReplyRegistry)
 * @param {Object|null} [data=null] - Optional data to store alongside the command ID
 */
async function registerPendingReply(chatId, commandId, data = null) {
  await ensureTable();

  const entity = {
    partitionKey: PARTITION_KEY,
    rowKey: String(chatId),
    commandId,
    data: data ? JSON.stringify(data) : '',
    createdAt: new Date().toISOString(),
  };

  await tableClient.upsertEntity(entity);
}

/**
 * Get the pending reply entry without removing it.
 * Resolves the command ID to handler/validate/resendPrompt via the registry.
 * @param {number} chatId
 * @returns {Promise<{ handler: function, validate: function|null, resendPromptIfNotValid: string|null }|undefined>}
 */
async function getPendingReply(chatId) {
  await ensureTable();

  try {
    const entity = await tableClient.getEntity(PARTITION_KEY, String(chatId));

    if (isExpired(entity.createdAt)) {
      await tableClient.deleteEntity(PARTITION_KEY, String(chatId)).catch(() => {});

      return undefined;
    }

    const data = entity.data ? JSON.parse(entity.data) : null;

    return resolveCommand(entity.commandId, chatId, data);
  } catch {
    return undefined;
  }
}

/**
 * Remove the pending reply without executing it.
 * @param {number} chatId
 */
async function clearPendingReply(chatId) {
  await ensureTable();

  await tableClient.deleteEntity(PARTITION_KEY, String(chatId)).catch(() => {});
}

/**
 * Check if a pending reply entry has expired based on TTL.
 * @param {string} createdAt - ISO timestamp
 * @returns {boolean}
 */
function isExpired(createdAt) {
  return Date.now() - new Date(createdAt).getTime() > TTL_MS;
}

module.exports = {
  registerPendingReply,
  getPendingReply,
  clearPendingReply,
};
