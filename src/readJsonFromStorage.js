const { BlobServiceClient } = require('@azure/storage-blob');
const { sendLogMessage, validateJsonData } = require('./utils');
const { LOG_CHANNEL_ID } = require('./constants');
const {
  driversCache,
  constructorsCache,
  sharedKey,
  simulationNameCache,
} = require('./cache');

exports.readJsonFromStorage = async function (bot) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    throw new Error('Missing required Azure storage configuration');
  }

  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobName = `f1-fantasy-data.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const downloadResponse = await blockBlobClient.download();
  const jsonString = await streamToString(downloadResponse.readableStreamBody);
  const jsonFromStorage = JSON.parse(jsonString);

  sendLogMessage(
    bot,
    `jsonFromStorage downloaded successfully. Simulation: ${jsonFromStorage?.SimulationName}`
  );

  const isValid = validateJsonData(bot, jsonFromStorage, LOG_CHANNEL_ID, false);

  if (!isValid) {
    return;
  }

  // Store the simulation name in cache
  simulationNameCache[sharedKey] = jsonFromStorage.SimulationName;

  // Transform arrays to objects using Object.fromEntries
  driversCache[sharedKey] = Object.fromEntries(
    jsonFromStorage.Drivers.map((driver) => [driver.DR, driver])
  );

  constructorsCache[sharedKey] = Object.fromEntries(
    jsonFromStorage.Constructors.map((constructor) => [
      constructor.CN,
      constructor,
    ])
  );
};

// Helper function to convert stream to string
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
