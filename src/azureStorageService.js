const { BlobServiceClient } = require('@azure/storage-blob');
const { sendLogMessage, getDisplayName } = require('./utils/utils');

let blobServiceClient;
let containerClient;

/**
 * Initialize Azure Storage clients using environment variables
 * @throws {Error} If required Azure storage configuration is missing
 */
function initializeAzureStorage() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    throw new Error('Missing required Azure storage configuration');
  }

  blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = blobServiceClient.getContainerClient(containerName);
}

/**
 * Helper function to convert stream to string
 * @param {NodeJS.ReadableStream} readableStream - The readable stream to convert
 * @returns {Promise<string>} The stream content as a string
 */
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data.toString());
    });
    readableStream.on('end', () => {
      resolve(chunks.join(''));
    });
    readableStream.on('error', reject);
  });
}

/**
 * Get the main F1 fantasy data from Azure Storage
 * @returns {Promise<Object>} The parsed fantasy data
 * @throws {Error} If the data cannot be retrieved or parsed
 */
async function getFantasyData() {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = 'f1-fantasy-data.json';
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to get fantasy data: ${error.message}`);
  }
}

/**
 * Get the next race info data from Azure Storage
 * @returns {Promise<Object>} The parsed next race info data
 * @throws {Error} If the data cannot be retrieved or parsed
 */
async function getNextRaceInfoData() {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = 'next-race-info.json';
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to get next race info data: ${error.message}`);
  }
}

/**
 * Get the latest live-score data from Azure Storage.
 * @returns {Promise<Object>} Parsed live-score payload
 * @throws {Error} If the data cannot be retrieved or parsed
 */
async function getLiveScoreData() {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const liveScoreContainerName = 'f1-fantasy-scraper-json';

    if (!connectionString) {
      throw new Error('Missing required Azure storage configuration');
    }

    if (!blobServiceClient) {
      blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    }

    const liveScoreContainerClient =
      blobServiceClient.getContainerClient(liveScoreContainerName);
    const blobName = 'f1-live-score-latest.json';
    const blockBlobClient = liveScoreContainerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to get live score data: ${error.message}`);
  }
}

/**
 * Get a user's team data from Azure Storage
 * @param {string} chatId - The chat ID of the user
 * @param {string} teamId - The team identifier (e.g., 'T1', 'T2', 'T3')
 * @returns {Promise<Object|null>} The parsed team data or null if not found
 * @throws {Error} If there's an error retrieving or parsing the data
 */
async function getUserTeam(chatId, teamId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `user-teams/${chatId}_${teamId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Check if the blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      `Failed to get user team for ${chatId}_${teamId}: ${error.message}`,
    );
  }
}

/**
 * Save a user's team data to Azure Storage
 * @param {Object} bot - The Telegram bot instance
 * @param {string} chatId - The chat ID of the user
 * @param {string} teamId - The team identifier (e.g., 'T1', 'T2', 'T3')
 * @param {Object} teamData - The team data to save
 * @param {Object} [options] - Optional flags
 * @param {boolean} [options.silent=false] - When true, suppress the success log message. Used by background flows (e.g., startup league refresh) to avoid log-channel spam.
 * @throws {Error} If the data cannot be saved
 */
// eslint-disable-next-line max-params
async function saveUserTeam(bot, chatId, teamId, teamData, options = {}) {
  const { silent = false } = options;
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `user-teams/${chatId}_${teamId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(teamData, null, 2);

    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });

    if (!silent) {
      const displayName = getDisplayName(chatId);

      await sendLogMessage(
        bot,
        `Successfully saved team data for ${displayName} (${chatId}) team ${teamId}`,
      );
    }
  } catch (error) {
    throw new Error(
      `Failed to save user team for ${chatId}_${teamId}: ${error.message}`,
    );
  }
}

/**
 * Delete a user's team data from Azure Storage
 * @param {Object} bot - The Telegram bot instance
 * @param {string} chatId - The chat ID of the user
 * @param {string} teamId - The team identifier (e.g., 'T1', 'T2', 'T3')
 * @throws {Error} If the data cannot be deleted
 */
async function deleteUserTeam(bot, chatId, teamId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `user-teams/${chatId}_${teamId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();

    const displayName = getDisplayName(chatId);

    await sendLogMessage(
      bot,
      `Successfully deleted team data for ${displayName} (${chatId}) team ${teamId}`,
    );
  } catch (error) {
    throw new Error(
      `Failed to delete user team for ${chatId}_${teamId}: ${error.message}`,
    );
  }
}

/**
 * Delete all team blobs for a user from Azure Storage
 * @param {Object} bot - The Telegram bot instance
 * @param {string} chatId - The chat ID of the user
 * @throws {Error} If the data cannot be deleted
 */
async function deleteAllUserTeams(bot, chatId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const prefix = `user-teams/${chatId}_`;
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
      await blockBlobClient.deleteIfExists();
    }

    const displayName = getDisplayName(chatId);

    await sendLogMessage(
      bot,
      `Successfully deleted all team data for ${displayName} (${chatId})`,
    );
  } catch (error) {
    throw new Error(
      `Failed to delete all user teams for ${chatId}: ${error.message}`,
    );
  }
}

/**
 * List and fetch all user team data from Azure Storage
 * @returns {Promise<Object>} Nested structure: { chatId: { T1: teamData, T2: teamData } }
 * @throws {Error} If the data cannot be retrieved or parsed
 */
async function listAllUserTeamData() {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const userTeams = {};
    const prefix = 'user-teams/';

    // List all blobs in the user-teams directory
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      // Extract chatId and teamId from the blob name (format: user-teams/{chatId}_{teamId}.json)
      // chatId is always numeric, so the first `_` is the separator. teamId itself
      // can contain underscores (e.g. `{leagueCode}_{teamName}` for league-loaded teams).
      const fileName = blob.name.substring(prefix.length).replace('.json', '');
      const separatorIdx = fileName.indexOf('_');
      if (separatorIdx === -1) {
        continue;
      }
      const chatId = fileName.substring(0, separatorIdx);
      const teamId = fileName.substring(separatorIdx + 1);

      // Get the team data for this user
      const teamData = await getUserTeam(chatId, teamId);
      if (teamData) {
        if (!userTeams[chatId]) {
          userTeams[chatId] = {};
        }
        userTeams[chatId][teamId] = teamData;
      }
    }

    return userTeams;
  } catch (error) {
    throw new Error(`Failed to list user teams: ${error.message}`);
  }
}

/**
 * Save pending team assignment data to Azure Blob Storage.
 * Used when AI can't extract teamId and the user must assign it.
 * @param {string} chatId - The chat ID of the user
 * @param {string} uniqueKey - A unique key for this pending assignment (e.g., fileUniqueId)
 * @param {Object} teamData - The extracted team data to store temporarily
 * @throws {Error} If the data cannot be saved
 */
async function savePendingTeamAssignment(chatId, uniqueKey, teamData) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `pending-team-assignments/${chatId}_${uniqueKey}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(teamData, null, 2);

    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
  } catch (error) {
    throw new Error(
      `Failed to save pending team assignment for ${chatId}: ${error.message}`,
    );
  }
}

/**
 * Get pending team assignment data from Azure Blob Storage.
 * @param {string} chatId - The chat ID of the user
 * @param {string} uniqueKey - The unique key for this pending assignment
 * @returns {Promise<Object|null>} The stored team data or null if not found
 * @throws {Error} If there's an error retrieving the data
 */
async function getPendingTeamAssignment(chatId, uniqueKey) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `pending-team-assignments/${chatId}_${uniqueKey}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      `Failed to get pending team assignment for ${chatId}: ${error.message}`,
    );
  }
}

/**
 * Delete pending team assignment data from Azure Blob Storage.
 * @param {string} chatId - The chat ID of the user
 * @param {string} uniqueKey - The unique key for this pending assignment
 */
async function deletePendingTeamAssignment(chatId, uniqueKey) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `pending-team-assignments/${chatId}_${uniqueKey}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  } catch (error) {
    console.error(
      `Failed to delete pending team assignment for ${chatId}: ${error.message}`,
    );
  }
}

/**
 * Get the league leaderboard data for a given league code from Azure Blob Storage.
 * Blob path mirrors the writer in the sibling f1-fantasy-api-data repo:
 *   leagues/{leagueCode}/league-standings.json
 * @param {string} leagueCode
 * @returns {Promise<Object|null>} Parsed league data, or null if the blob does not exist.
 * @throws {Error} If the blob exists but can not be retrieved/parsed.
 */
async function getLeagueData(leagueCode) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `leagues/${leagueCode}/league-standings.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      `Failed to get league data for ${leagueCode}: ${error.message}`,
    );
  }
}

/**
 * Get the teams-data (per-team roster, budget, transfers) for a given league code
 * from Azure Blob Storage. Blob path mirrors the writer in the sibling
 * f1-fantasy-api-data repo: leagues/{leagueCode}/teams-data.json
 * @param {string} leagueCode
 * @returns {Promise<Object|null>} Parsed teams-data, or null if the blob does not exist.
 * @throws {Error} If the blob exists but cannot be retrieved/parsed.
 */
async function getLeagueTeamsData(leagueCode) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `leagues/${leagueCode}/teams-data.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      `Failed to get league teams data for ${leagueCode}: ${error.message}`,
    );
  }
}

/**
 * Save a Teams-Tracker staging session for a user.
 * Allows the multi-step inline-keyboard flow to survive across servers.
 * @param {string|number} chatId
 * @param {Object} session
 */
async function saveTeamsTrackerSession(chatId, session) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `teams-tracker-sessions/${chatId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(session, null, 2);

    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
  } catch (error) {
    throw new Error(
      `Failed to save teams tracker session for ${chatId}: ${error.message}`,
    );
  }
}

/**
 * Read the Teams-Tracker staging session for a user.
 * @param {string|number} chatId
 * @returns {Promise<Object|null>}
 */
async function getTeamsTrackerSession(chatId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `teams-tracker-sessions/${chatId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody,
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      `Failed to get teams tracker session for ${chatId}: ${error.message}`,
    );
  }
}

/**
 * Delete the Teams-Tracker staging session for a user.
 * @param {string|number} chatId
 */
async function deleteTeamsTrackerSession(chatId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `teams-tracker-sessions/${chatId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  } catch (error) {
    console.error(
      `Failed to delete teams tracker session for ${chatId}: ${error.message}`,
    );
  }
}

module.exports = {
  getFantasyData,
  getUserTeam,
  saveUserTeam,
  deleteUserTeam,
  deleteAllUserTeams,
  listAllUserTeamData,
  getNextRaceInfoData,
  getLiveScoreData,
  savePendingTeamAssignment,
  getPendingTeamAssignment,
  deletePendingTeamAssignment,
  saveTeamsTrackerSession,
  getTeamsTrackerSession,
  deleteTeamsTrackerSession,
  getLeagueData,
  getLeagueTeamsData,
};
