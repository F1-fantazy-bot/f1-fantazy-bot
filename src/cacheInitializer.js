const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationInfoCache,
  sharedKey,
  nextRaceInfoCache,
  languageCache,
} = require('./cache');
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
  getFantasyData,
  listAllUserTeamData,
  listAllUserSettingsData,
  getNextRaceInfoData,
} = require('./azureStorageService');

/**
 * Initialize all application caches with data from Azure Storage
 * @param {TelegramBot} bot - The Telegram bot instance for logging
 * @throws {Error} If data validation fails or there are critical errors
 */
async function initializeCaches(bot) {
  // Load simulation data first
  await loadSimulationData(bot);

  // Load next race info into cache
  try {
    const nextRaceInfo = await getNextRaceInfoData();
    nextRaceInfoCache[sharedKey] = nextRaceInfo;
    await sendLogMessage(bot, `Next race info loaded successfully`);
  } catch (error) {
    await sendLogMessage(
      bot,
      `Failed to load next race info: ${error.message}`
    );
  }

  // Load all user teams into cache
  const userTeams = await listAllUserTeamData();
  Object.assign(currentTeamCache, userTeams);

  await sendLogMessage(
    bot,
    `Loaded ${Object.keys(userTeams).length} user teams from storage`
  );

  // Load all user settings into cache
  const userSettings = await listAllUserSettingsData();
  Object.entries(userSettings).forEach(([id, settings]) => {
    if (settings.lang) {
      languageCache[id] = settings.lang;
    }
  });

  await sendLogMessage(
    bot,
    `Loaded ${Object.keys(userSettings).length} user settings from storage`
  );
}

/**
 * Load simulation data from Azure Storage and update simulation-related caches
 * @param {TelegramBot} bot - The Telegram bot instance for logging
 * @throws {Error} If data validation fails or there are critical errors
 */
async function loadSimulationData(bot) {
  // Get main fantasy data
  const fantasyDataJson = await getFantasyData();

  await sendLogMessage(
    bot,
    `Fantasy data json downloaded successfully. Simulation: ${
      fantasyDataJson?.SimulationName
    }${
      fantasyDataJson?.SimulationLastUpdate
        ? ` (Last updated: ${fantasyDataJson.SimulationLastUpdate})`
        : ''
    }`
  );

  // Validate the main fantasy data
  const isValid = await validateJsonData(
    bot,
    fantasyDataJson,
    LOG_CHANNEL_ID,
    false
  );

  if (!isValid) {
    throw new Error('Fantasy data validation failed');
  }

  // Store simulation info in cache
  simulationInfoCache[sharedKey] = {
    name: fantasyDataJson.SimulationName,
    lastUpdate: fantasyDataJson.SimulationLastUpdate || null,
  };

  const notFounds = {
    drivers: [],
    constructors: [],
  };

  // Process drivers data
  driversCache[sharedKey] = Object.fromEntries(
    fantasyDataJson.Drivers.map((driver) => [driver.DR, driver])
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
    fantasyDataJson.Constructors.map((constructor) => [
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

  await sendLogMessage(
    bot,
    `Simulation data loaded successfully: ${fantasyDataJson.SimulationName}`
  );
}

module.exports = {
  initializeCaches,
  loadSimulationData,
};
