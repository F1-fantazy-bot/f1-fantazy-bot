const { BlobServiceClient } = require('@azure/storage-blob');
const { sendLogMessage } = require('./utils/utils');

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
      downloadResponse.readableStreamBody
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to get fantasy data: ${error.message}`);
  }
}

/**
 * Get a user's team data from Azure Storage
 * @param {string} chatId - The chat ID of the user
 * @returns {Promise<Object|null>} The parsed team data or null if not found
 * @throws {Error} If there's an error retrieving or parsing the data
 */
async function getUserTeam(chatId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `user-teams/${chatId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Check if the blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      return null;
    }

    const downloadResponse = await blockBlobClient.download();
    const jsonString = await streamToString(
      downloadResponse.readableStreamBody
    );

    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to get user team for ${chatId}: ${error.message}`);
  }
}

/**
 * Save a user's team data to Azure Storage
 * @param {string} chatId - The chat ID of the user
 * @param {Object} teamData - The team data to save
 * @throws {Error} If the data cannot be saved
 */
async function saveUserTeam(bot, chatId, teamData) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `user-teams/${chatId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const content = JSON.stringify(teamData, null, 2);

    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });

    await sendLogMessage(
      bot,
      `Successfully saved team data for chatId: ${chatId}`
    );
  } catch (error) {
    throw new Error(`Failed to save user team for ${chatId}: ${error.message}`);
  }
}

/**
 * Delete a user's team data from Azure Storage
 * @param {string} chatId - The chat ID of the user
 * @throws {Error} If the data cannot be deleted
 */
async function deleteUserTeam(bot, chatId) {
  try {
    if (!containerClient) {
      initializeAzureStorage();
    }

    const blobName = `user-teams/${chatId}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();

    await sendLogMessage(
      bot,
      `Successfully deleted team data for chatId: ${chatId}`
    );
  } catch (error) {
    throw new Error(
      `Failed to delete user team for ${chatId}: ${error.message}`
    );
  }
}

/**
 * List and fetch all user team data from Azure Storage
 * @returns {Promise<Array<{chatId: string, teamData: Object}>>} Array of user teams with their chat IDs
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
      // Extract chatId from the blob name (remove prefix and .json)
      const chatId = blob.name.substring(prefix.length).replace('.json', '');

      // Get the team data for this user
      const teamData = await getUserTeam(chatId);
      if (teamData) {
        userTeams[chatId] = teamData;
      }
    }

    return userTeams;
  } catch (error) {
    throw new Error(`Failed to list user teams: ${error.message}`);
  }
}

module.exports = {
  getFantasyData,
  getUserTeam,
  saveUserTeam,
  deleteUserTeam,
  listAllUserTeamData,
};
