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
  setPrices,
  clearPrices,
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
  getPricesData,
  listAllUserTeamData,
  getNextRaceInfoData,
  getLeagueTeamsData,
  saveUserTeam,
} = require('./azureStorageService');
const { listAllUsers } = require('./userRegistryService');
const { fetchRemainingRaceCount } = require('./raceScheduleService');
const { listUserLeagues } = require('./leagueRegistryService');
const { buildLeagueTeamId } = require('./utils/teamId');
const { mapLeagueTeamToBotTeam } = require('./utils/leagueTeamHelpers');
const { applyPrices } = require('./priceData');

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

  // Load all user data into userCache (from UserRegistry table). This must
  // happen BEFORE refreshLeagueSourcedTeams so the migration step can read
  // and rewrite `selectedTeam` / `selectedBestTeamByTeam` in-memory.
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

  // Refresh any league-sourced teams from the latest league teams-data blob so
  // rosters/budgets/transfers stay in sync between restarts. This pass ALSO
  // performs the one-time migration from the old league-scoped teamId
  // (`{leagueCode}_{sanitizedTeamName}`) to the new global fantasy teamId
  // (`{sanitize(userName)}_{teamNo}`) — see refreshLeagueSourcedTeams below.
  await refreshLeagueSourcedTeams(bot);
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

  try {
    const pricesData = await getPricesData();
    const pricedData = applyPrices(
      {
        drivers: driversCache[sharedKey],
        constructors: constructorsCache[sharedKey],
      },
      pricesData,
    );

    driversCache[sharedKey] = pricedData.drivers;
    constructorsCache[sharedKey] = pricedData.constructors;
    setPrices({
      drivers: pricedData.priceMaps.drivers,
      constructors: pricedData.priceMaps.constructors,
      metadata: {
        fetchedAt: pricesData.fetchedAt || null,
        matchdayId: pricesData.matchdayId || null,
      },
    });

    await sendLogMessage(
      bot,
      `Prices data loaded successfully${
        pricesData?.matchdayId ? ` for matchday ${pricesData.matchdayId}` : ''
      }`,
    );
    await reportPriceDataGaps(bot, pricedData.report);
  } catch (error) {
    clearPrices();
    await sendErrorMessage(
      bot,
      `Failed to load prices data; falling back to simulation prices: ${error.message}`,
    );
  }

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
}

async function reportPriceDataGaps(bot, report) {
  const messages = [];
  const addMessage = (label, values) => {
    if (values.length > 0) {
      messages.push(`${label}: ${values.join(', ')}`);
    }
  };

  addMessage('Driver prices not mapped from prices.json', report.drivers.unmapped);
  addMessage('Driver prices invalid in prices.json', report.drivers.invalid);
  addMessage(
    'Drivers missing from prices.json, using fallback prices',
    report.drivers.missing,
  );
  addMessage(
    'Constructor prices not mapped from prices.json',
    report.constructors.unmapped,
  );
  addMessage(
    'Constructor prices invalid in prices.json',
    report.constructors.invalid,
  );
  addMessage(
    'Constructors missing from prices.json, using fallback prices',
    report.constructors.missing,
  );

  if (messages.length === 0) {
    return;
  }

  await sendErrorMessage(
    bot,
    `
🔴🔴🔴
Price data gaps:
${messages.join('\n')}
🔴🔴🔴`,
  );
}

/**
 * For any cached team in league format (`{sanitize(userName)}_{teamNo}`),
 * re-fetch the team's latest entry from one of the user's followed
 * `teams-data.json` blobs and replace the cached data + persisted blob
 * with the latest roster/budget/transfers.
 *
 * Best-effort: errors for individual leagues or teams are logged but do
 * not abort cache initialization.
 */
async function refreshLeagueSourcedTeams(bot) {
  const leagueTeamsByCode = {};
  const userLeagueCodesByChatId = {};
  let refreshed = 0;
  let missing = 0;
  let failed = 0;

  async function loadLeagueTeams(leagueCode) {
    if (!(leagueCode in leagueTeamsByCode)) {
      try {
        leagueTeamsByCode[leagueCode] = await getLeagueTeamsData(leagueCode);
      } catch (err) {
        console.error(`Failed to fetch teams-data for ${leagueCode}:`, err);
        leagueTeamsByCode[leagueCode] = null;
      }
    }

    return leagueTeamsByCode[leagueCode];
  }

  async function loadFollowedLeagueCodes(chatId) {
    if (!(chatId in userLeagueCodesByChatId)) {
      try {
        const leagues = await listUserLeagues(chatId);
        userLeagueCodesByChatId[chatId] = (leagues || []).map(
          (l) => l.leagueCode,
        );
      } catch (err) {
        console.error(`Failed to list user leagues for ${chatId}:`, err);
        userLeagueCodesByChatId[chatId] = [];
      }
    }

    return userLeagueCodesByChatId[chatId];
  }

  for (const [chatId, teamsById] of Object.entries(currentTeamCache)) {
    if (!teamsById || typeof teamsById !== 'object') {continue;}

    const followedLeagueCodes = await loadFollowedLeagueCodes(chatId);
    const teamIds = Object.keys(teamsById);

    for (const teamId of teamIds) {
      // Screenshot teams (`T1`/`T2`/`T3`) have no `_` — skip.
      if (!teamId.includes('_')) {continue;}

      try {
        let foundMatch = null;
        for (const leagueCode of followedLeagueCodes) {
          const data = await loadLeagueTeams(leagueCode);
          if (!data || !Array.isArray(data.teams)) {continue;}

          const match = data.teams.find(
            (team) =>
              buildLeagueTeamId(team.userName, team.teamNo) === teamId,
          );
          if (match) {
            foundMatch = match;
            break;
          }
        }

        if (!foundMatch) {
          missing += 1;
          continue;
        }

        const refreshedTeam = mapLeagueTeamToBotTeam(foundMatch);
        currentTeamCache[chatId][teamId] = refreshedTeam;

        try {
          await saveUserTeam(bot, chatId, teamId, refreshedTeam, {
            silent: true,
          });
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
