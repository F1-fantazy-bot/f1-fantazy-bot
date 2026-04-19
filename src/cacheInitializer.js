const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationInfoCache,
  sharedKey,
  nextRaceInfoCache,
  userCache,
  remainingRaceCountCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedBestTeamByTeam,
} = require('./cache');
const {
  sendLogMessage,
  sendErrorMessage,
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
  getNextRaceInfoData,
  getLeagueTeamsData,
  saveUserTeam,
} = require('./azureStorageService');
const { listAllUsers } = require('./userRegistryService');
const { fetchRemainingRaceCount } = require('./raceScheduleService');
const {
  mapLeagueTeamToBotTeam,
  sanitizeTeamName,
} = require('./commandsHandler/selectTeamFromLeagueHandler');

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
    await sendErrorMessage(
      bot,
      `Failed to load next race info: ${error.message}`
    );
  }

  try {
    remainingRaceCountCache[sharedKey] = await fetchRemainingRaceCount();
    await sendLogMessage(
      bot,
      `Remaining race count loaded successfully: ${remainingRaceCountCache[sharedKey]}`,
    );
  } catch (error) {
    await sendErrorMessage(
      bot,
      `Failed to load remaining race count: ${error.message}`,
    );
  }

  // Load all user teams into cache
  const userTeams = await listAllUserTeamData();
  Object.assign(currentTeamCache, userTeams);

  await sendLogMessage(
    bot,
    `Loaded ${Object.keys(userTeams).length} user teams from storage`
  );

  // Refresh any league-sourced teams from the latest league teams-data blob so
  // rosters/budgets/transfers stay in sync between restarts.
  await refreshLeagueSourcedTeams(bot);

  // Load all user data into userCache (from UserRegistry table)
  const users = await listAllUsers();
  for (const user of users) {
    const key = String(user.chatId);
    const { chatId: _id, ...userData } = user;

    userData.bestTeamBudgetChangePointsPerMillion =
      normalizeBestTeamBudgetChangePointsPerMillion(
        userData.bestTeamBudgetChangePointsPerMillion,
      );
    userData.selectedBestTeamByTeam = normalizeSelectedBestTeamByTeam(
      userData.selectedBestTeamByTeam,
    );

    userCache[key] = userData;
  }

  await sendLogMessage(
    bot,
    `Loaded ${users.length} users into cache from storage`
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

    await sendErrorMessage(bot, message);
    await sendMessageToAdmins(bot, message);
  }

  if (notFounds.constructors.length > 0) {
    const message = `
🔴🔴🔴
Constructors not found in mapping: ${notFounds.constructors.join(', ')}
🔴🔴🔴`;

    await sendErrorMessage(bot, message);
    await sendMessageToAdmins(bot, message);
  }

  await sendLogMessage(
    bot,
    `Simulation data loaded successfully: ${fantasyDataJson.SimulationName}`
  );
}

/**
 * For any cached team whose id is in league format ("{leagueCode}_{slug}"),
 * re-fetch the league's teams-data.json and replace the cached data (and the
 * persisted blob) with the latest roster/budget/transfers for that team.
 *
 * Best-effort: errors for individual leagues or teams are logged but do not
 * abort cache initialization.
 */
async function refreshLeagueSourcedTeams(bot) {
  const leagueTeamsByCode = {};
  let refreshed = 0;
  let missing = 0;
  let failed = 0;

  for (const [chatId, teamsById] of Object.entries(currentTeamCache)) {
    if (!teamsById || typeof teamsById !== 'object') {continue;}

    for (const teamId of Object.keys(teamsById)) {
      const underscoreIdx = teamId.indexOf('_');
      if (underscoreIdx <= 0) {continue;}

      const leagueCode = teamId.slice(0, underscoreIdx);
      const sanitizedSlug = teamId.slice(underscoreIdx + 1);

      try {
        if (!(leagueCode in leagueTeamsByCode)) {
          leagueTeamsByCode[leagueCode] = await getLeagueTeamsData(leagueCode);
        }
        const data = leagueTeamsByCode[leagueCode];

        if (!data || !Array.isArray(data.teams)) {
          missing += 1;
          continue;
        }

        const match = data.teams.find(
          (team) => sanitizeTeamName(team.teamName) === sanitizedSlug,
        );

        if (!match) {
          missing += 1;
          continue;
        }

        const refreshedTeam = mapLeagueTeamToBotTeam(match);
        currentTeamCache[chatId][teamId] = refreshedTeam;

        try {
          await saveUserTeam(bot, chatId, teamId, refreshedTeam);
        } catch (saveErr) {
          console.error(
            `Failed to persist refreshed league team ${teamId} for ${chatId}:`,
            saveErr,
          );
        }

        refreshed += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `Failed to refresh league-sourced team ${teamId} for ${chatId}:`,
          err,
        );
      }
    }
  }

  if (refreshed > 0 || missing > 0 || failed > 0) {
    await sendLogMessage(
      bot,
      `League-sourced teams refresh: ${refreshed} refreshed, ${missing} missing in league, ${failed} failed`,
    );
  }
}

module.exports = {
  initializeCaches,
  loadSimulationData,
  refreshLeagueSourcedTeams,
};
