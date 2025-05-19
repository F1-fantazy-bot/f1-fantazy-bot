const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationNameCache,
  sharedKey,
} = require('./cache');
const { validateJsonData } = require('./utils');
const {
  LOG_CHANNEL_ID,
  NAME_TO_CODE_DRIVERS_MAPPING,
  NAME_TO_CODE_CONSTRUCTORS_MAPPING,
} = require('./constants');
const azureStorageService = require('./azureStorageService');

/**
 * Initialize all application caches with data from Azure Storage
 * @param {TelegramBot} bot - The Telegram bot instance for logging
 * @throws {Error} If data validation fails or there are critical errors
 */
async function initializeCaches(bot) {
  // Get main fantasy data
  const jsonFromStorage = await azureStorageService.getFantasyData();

  await bot.sendMessage(
    LOG_CHANNEL_ID,
    `jsonFromStorage downloaded successfully. Simulation: ${jsonFromStorage?.SimulationName}`
  );

  // Validate the main fantasy data
  const isValid = await validateJsonData(
    bot,
    jsonFromStorage,
    LOG_CHANNEL_ID,
    false
  );

  if (!isValid) {
    throw new Error('Fantasy data validation failed');
  }

  // Store simulation name in cache
  simulationNameCache[sharedKey] = jsonFromStorage.SimulationName;

  const notFounds = {
    drivers: [],
    constructors: [],
  };

  // Process drivers data
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

  // Process constructors data
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

  // Log any missing mappings
  if (notFounds.drivers.length > 0) {
    const message = `
🔴🔴🔴
Drivers not found in mapping: ${notFounds.drivers.join(', ')}
🔴🔴🔴`;

    await bot.sendMessage(LOG_CHANNEL_ID, message);
  }

  if (notFounds.constructors.length > 0) {
    const message = `
🔴🔴🔴
Constructors not found in mapping: ${notFounds.constructors.join(', ')}
🔴🔴🔴`;

    await bot.sendMessage(LOG_CHANNEL_ID, message);
  }

  // Load all user teams into cache
  const userTeams = await azureStorageService.listAllUserTeamData();
  for (const { chatId, teamData } of userTeams) {
    currentTeamCache[chatId] = teamData;
  }

  await bot.sendMessage(
    LOG_CHANNEL_ID,
    `Loaded ${userTeams.length} user teams from storage`
  );
}

module.exports = {
  initializeCaches,
};
