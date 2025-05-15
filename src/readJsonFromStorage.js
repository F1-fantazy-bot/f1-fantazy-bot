const { BlobServiceClient } = require('@azure/storage-blob');
const {
  sendLogMessage,
  sendMessageToAdmins,
  validateJsonData,
} = require('./utils');
const {
  LOG_CHANNEL_ID,
  NAME_TO_CODE_DRIVERS_MAPPING,
  NAME_TO_CODE_CONSTRUCTORS_MAPPING,
} = require('./constants');
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

  await sendLogMessage(
    bot,
    `jsonFromStorage downloaded successfully. Simulation: ${jsonFromStorage?.SimulationName}`
  );

  const isValid = await validateJsonData(
    bot,
    jsonFromStorage,
    LOG_CHANNEL_ID,
    false
  );

  if (!isValid) {
    return;
  }

  // Store the simulation name in cache
  simulationNameCache[sharedKey] = jsonFromStorage.SimulationName;

  const notFounds = {
    drivers: [],
    constructors: [],
  };

  driversCache[sharedKey] = Object.fromEntries(
    jsonFromStorage.Drivers.map((driver) => [driver.DR, driver])
  );

  Object.values(driversCache[sharedKey]).forEach((driver) => {
    const driverCode = driver.DR;
    const driversCodeInMapping = Object.values(NAME_TO_CODE_DRIVERS_MAPPING);
    if (!driversCodeInMapping.includes(driverCode)) {
      notFounds.drivers.push(driverCode);
    }
  });

  constructorsCache[sharedKey] = Object.fromEntries(
    jsonFromStorage.Constructors.map((constructor) => [
      constructor.CN,
      constructor,
    ])
  );

  Object.values(constructorsCache[sharedKey]).forEach((constructor) => {
    const constructorCode = constructor.CN;
    const constructorsCodeInMapping = Object.values(
      NAME_TO_CODE_CONSTRUCTORS_MAPPING
    );
    if (!constructorsCodeInMapping.includes(constructorCode)) {
      notFounds.constructors.push(constructorCode);
    }
  });

  if (notFounds.drivers.length > 0) {
    const message = `
🔴🔴🔴
Drivers not found in mapping: ${notFounds.drivers.join(', ')}
🔴🔴🔴`;

    await sendLogMessage(bot, message);
    await sendMessageToAdmins(bot, message);
  }
  if (notFounds.constructors.length > 0) {
    const message = `
🔴🔴🔴
Constructors not found in mapping: ${notFounds.constructors.join(', ')}
🔴🔴🔴`;

    await sendLogMessage(bot, message);
    await sendMessageToAdmins(bot, message);
  }
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
