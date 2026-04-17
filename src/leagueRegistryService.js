// League Registry Service
// Tracks the F1 Fantasy leagues each user follows, stored in Azure Table Storage.
// One row per (chatId, leagueCode). Uses Azure Table Storage "Merge" mode so that
// adding attributes in the future does not require migrations.

const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'UserLeagues';

// Azure Table Storage system fields excluded when returning league data
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
      'Missing AZURE_STORAGE_CONNECTION_STRING for league registry storage',
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

function entityToLeague(entity) {
  const league = {
    chatId: entity.partitionKey,
    leagueCode: entity.rowKey,
  };

  for (const [key, value] of Object.entries(entity)) {
    if (!SYSTEM_FIELDS.has(key)) {
      league[key] = value;
    }
  }

  return league;
}

/**
 * Register (upsert) a league for a user using Merge mode.
 * Preserves any other fields already stored on the row.
 * @param {number|string} chatId
 * @param {string} leagueCode
 * @param {string} leagueName
 */
async function addUserLeague(chatId, leagueCode, leagueName) {
  await ensureTable();

  const entity = {
    partitionKey: String(chatId),
    rowKey: String(leagueCode),
    leagueName,
    registeredAt: new Date().toISOString(),
  };

  await tableClient.upsertEntity(entity, 'Merge');
}

/**
 * Remove a league follow for a user.
 * @param {number|string} chatId
 * @param {string} leagueCode
 */
async function removeUserLeague(chatId, leagueCode) {
  await ensureTable();

  try {
    await tableClient.deleteEntity(String(chatId), String(leagueCode));
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
  }
}

/**
 * List all leagues a user follows.
 * @param {number|string} chatId
 * @returns {Promise<Array<{chatId, leagueCode, leagueName, registeredAt}>>}
 */
async function listUserLeagues(chatId) {
  await ensureTable();

  const partitionKey = String(chatId);
  const leagues = [];

  for await (const entity of tableClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${partitionKey}'` },
  })) {
    leagues.push(entityToLeague(entity));
  }

  return leagues;
}

/**
 * Point lookup for a single league follow.
 * @param {number|string} chatId
 * @param {string} leagueCode
 * @returns {Promise<Object|null>}
 */
async function getUserLeague(chatId, leagueCode) {
  await ensureTable();

  try {
    const entity = await tableClient.getEntity(
      String(chatId),
      String(leagueCode),
    );

    return entityToLeague(entity);
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }

    throw err;
  }
}

module.exports = {
  addUserLeague,
  removeUserLeague,
  listUserLeagues,
  getUserLeague,
};
