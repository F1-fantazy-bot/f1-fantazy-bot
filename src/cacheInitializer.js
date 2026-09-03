const {
  currentTeamCache,
  sharedKey,
  nextRaceInfoCache,
  userCache,
  selectedChipCache,
  remainingRaceCountCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedChipByTeam,
  normalizeSelectedBestTeamByTeam,
} = require('./cache');
const {
  sendLogMessage,
  sendErrorMessage,
} = require('./utils');
const {
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
const { refreshSimulationData } = require('./services/simulationRefreshService');

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
    const ownedTeamIds = new Set(
      Object.keys(currentTeamCache[key] || {}),
    );
    userData.selectedChipByTeam = Object.fromEntries(
      Object.entries(
        normalizeSelectedChipByTeam(userData.selectedChipByTeam),
      ).filter(([teamId]) => ownedTeamIds.has(teamId)),
    );
    if (Object.keys(userData.selectedChipByTeam).length > 0) {
      selectedChipCache[key] = userData.selectedChipByTeam;
    } else {
      delete selectedChipCache[key];
    }

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
  return await refreshSimulationData({ bot });
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
