const { normalizeChipExpiryByTeam } = require('./utils/chipExpiry');
const {
  currentTeamCache,
  bestTeamsCache,
  sharedKey,
  nextRaceInfoCache,
  userCache,
  selectedChipCache,
  remainingRaceCountCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedChipByTeam,
  serializeSelectedChipByTeam,
  normalizeSelectedBestTeamByTeam,
  serializeSelectedBestTeamByTeam,
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
  deleteUserTeam,
} = require('./azureStorageService');
const {
  listAllUsers,
  updateUserAttributesAtomically,
} = require('./userRegistryService');
const { fetchRemainingRaceCount } = require('./raceScheduleService');
const { listUserLeagues } = require('./leagueRegistryService');
const {
  buildLegacyLeagueTeamId,
  buildLeagueTeamId,
  buildLeagueTeamIdentityKey,
} = require('./utils/teamId');
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
    userData.selectedChipExpiryByTeam = Object.fromEntries(
      Object.entries(normalizeChipExpiryByTeam(userData.selectedChipExpiryByTeam))
        .filter(([teamId]) => ownedTeamIds.has(teamId)),
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
  // rosters/budgets/transfers stay in sync between restarts. This pass also
  // migrates the legacy `{sanitize(userName)}_{teamNo}` identity to the
  // account-aware `{sanitize(userName)}_{teamNo}_{accountId}` identity when
  // the mapping is unique. Ambiguous legacy ids are removed for reselection.
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
 * Refresh league-sourced cached teams from followed `teams-data.json` blobs.
 * Account-aware ids are refreshed in place. Legacy
 * `{sanitize(userName)}_{teamNo}` ids are migrated only when they resolve to
 * exactly one `accountId`; ambiguous ids are deleted so no account is chosen
 * silently and the user can reselect the intended team.
 *
 * Best-effort: errors for individual leagues or teams are logged but do not
 * abort cache initialization.
 */
async function refreshLeagueSourcedTeams(bot, onlyChatId = null) {
  const leagueTeamsByCode = {};
  const userLeagueCodesByChatId = {};
  let refreshed = 0;
  let missing = 0;
  let failed = 0;
  let migrated = 0;
  let ambiguous = 0;

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
          (league) => league.leagueCode,
        );
      } catch (err) {
        console.error(`Failed to list user leagues for ${chatId}:`, err);
        userLeagueCodesByChatId[chatId] = [];
      }
    }

    return userLeagueCodesByChatId[chatId];
  }

  function moveMapKey(map, oldTeamId, newTeamId) {
    if (!map || typeof map !== 'object' || !(oldTeamId in map)) {
      return map;
    }
    if (newTeamId && !(newTeamId in map)) {
      map[newTeamId] = map[oldTeamId];
    }
    delete map[oldTeamId];

    return map;
  }

  async function persistMigratedUser(chatId, oldTeamId, newTeamId) {
    const key = String(chatId);
    const result = await updateUserAttributesAtomically(chatId, (current) => {
      const changes = {};
      if (current.selectedTeam === oldTeamId) {
        changes.selectedTeam = newTeamId || null;
      }
      for (const [field, normalize, serialize] of [
        ['bestTeamBudgetChangePointsPerMillion', normalizeBestTeamBudgetChangePointsPerMillion, (value) => JSON.stringify(value)],
        ['selectedBestTeamByTeam', normalizeSelectedBestTeamByTeam, serializeSelectedBestTeamByTeam],
        ['selectedChipByTeam', normalizeSelectedChipByTeam, serializeSelectedChipByTeam],
      ]) {
        const value = normalize(current[field]);
        if (!Object.prototype.hasOwnProperty.call(value, oldTeamId)) {
          continue;
        }
        moveMapKey(value, oldTeamId, newTeamId);
        changes[field] = Object.keys(value).length ? serialize(value) : null;
      }

      return Object.keys(changes).length ? changes : null;
    });

    if (result.user && userCache[key]) {
      userCache[key].selectedTeam = result.user.selectedTeam || null;
      userCache[key].bestTeamBudgetChangePointsPerMillion =
        normalizeBestTeamBudgetChangePointsPerMillion(result.user.bestTeamBudgetChangePointsPerMillion);
      userCache[key].selectedBestTeamByTeam =
        normalizeSelectedBestTeamByTeam(result.user.selectedBestTeamByTeam);
      userCache[key].selectedChipByTeam = normalizeSelectedChipByTeam(result.user.selectedChipByTeam);
      if (Object.keys(userCache[key].selectedChipByTeam).length) {
        selectedChipCache[key] = userCache[key].selectedChipByTeam;
      } else {
        delete selectedChipCache[key];
      }
    }
  }

  for (const [chatId, teamsById] of Object.entries(currentTeamCache)) {
    if (onlyChatId !== null && chatId !== String(onlyChatId)) {
      continue;
    }
    if (!teamsById || typeof teamsById !== 'object') {
      continue;
    }

    const followedLeagueCodes = await loadFollowedLeagueCodes(chatId);
    const teamIds = Object.keys(teamsById);

    for (const oldTeamId of teamIds) {
      // Screenshot teams (T1/T2/T3) have no underscore.
      if (!oldTeamId.includes('_')) {
        continue;
      }

      try {
        const exactMatches = new Map();
        const legacyCandidates = new Map();
        const cachedTeam = teamsById[oldTeamId];
        const stableIdentity = buildLeagueTeamIdentityKey(
          cachedTeam?.accountId, cachedTeam?.teamNo,
        );

        for (const leagueCode of followedLeagueCodes) {
          const data = await loadLeagueTeams(leagueCode);
          if (!data || !Array.isArray(data.teams)) {
            continue;
          }

          for (const team of data.teams) {
            const canonicalId = buildLeagueTeamId(
              team.userName,
              team.teamNo,
              team.accountId,
            );
            if (!canonicalId) {
              continue;
            }

            if (canonicalId === oldTeamId && !exactMatches.has(canonicalId)) {
              exactMatches.set(canonicalId, team);
            }

            const legacyId = buildLegacyLeagueTeamId(
              team.userName,
              team.teamNo,
            );
            if (
              (stableIdentity
                ? buildLeagueTeamIdentityKey(team.accountId, team.teamNo) === stableIdentity
                : legacyId === oldTeamId) &&
              canonicalId !== oldTeamId &&
              !legacyCandidates.has(canonicalId)
            ) {
              legacyCandidates.set(canonicalId, team);
            }
          }
        }

        if (exactMatches.size > 0) {
          const foundMatch = exactMatches.values().next().value;
          const refreshedTeam = mapLeagueTeamToBotTeam(foundMatch);
          currentTeamCache[chatId][oldTeamId] = refreshedTeam;

          try {
            await saveUserTeam(bot, chatId, oldTeamId, refreshedTeam, {
              silent: true,
            });
          } catch (saveErr) {
            console.error(
              `Failed to persist refreshed league team ${oldTeamId} for ${chatId}:`,
              saveErr,
            );
          }

          refreshed += 1;
          continue;
        }

        if (legacyCandidates.size === 1) {
          const [newTeamId, foundMatch] = legacyCandidates.entries().next().value;
          const refreshedTeam = mapLeagueTeamToBotTeam(foundMatch);

          // Persist the new canonical blob before deleting the old one.
          await saveUserTeam(bot, chatId, newTeamId, refreshedTeam, {
            silent: true,
          });

          if (!(newTeamId in currentTeamCache[chatId])) {
            currentTeamCache[chatId][newTeamId] = refreshedTeam;
          }
          // Durable preferences must point at the new blob before the old
          // blob is removed. A crash between these steps is retryable.
          await persistMigratedUser(chatId, oldTeamId, newTeamId);
          delete currentTeamCache[chatId][oldTeamId];
          // The registry maps have already been updated from the latest
          // ETag-protected row. Only update process-local best-team results.
          moveMapKey(bestTeamsCache[String(chatId)], oldTeamId, newTeamId);

          try {
            await deleteUserTeam(bot, chatId, oldTeamId, { silent: true });
          } catch (deleteErr) {
            console.error(
              `Failed to delete migrated team ${oldTeamId} for ${chatId}:`,
              deleteErr,
            );
          }

          migrated += 1;
          continue;
        }

        if (legacyCandidates.size > 1) {
          // The old {userName}_{teamNo} id maps to multiple real F1 accounts.
          // Never guess which account was intended: drop the ambiguous legacy
          // entry and require the user to select the desired team again.
          await persistMigratedUser(chatId, oldTeamId, null);
          delete currentTeamCache[chatId][oldTeamId];
          moveMapKey(bestTeamsCache[String(chatId)], oldTeamId, null);

          try {
            await deleteUserTeam(bot, chatId, oldTeamId, { silent: true });
          } catch (deleteErr) {
            console.error(
              `Failed to delete ambiguous legacy team ${oldTeamId} for ${chatId}:`,
              deleteErr,
            );
          }

          ambiguous += 1;
          continue;
        }

        missing += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `Failed to refresh league-sourced team ${oldTeamId} for ${chatId}:`,
          err,
        );
      }
    }

  }

  if (
    refreshed > 0 ||
    missing > 0 ||
    failed > 0 ||
    migrated > 0 ||
    ambiguous > 0
  ) {
    await sendLogMessage(
      bot,
      `League-sourced teams refresh: ${refreshed} refreshed, ${missing} missing in league, ${failed} failed, ${migrated} migrated to account-aware ids, ${ambiguous} ambiguous legacy ids removed for reselection`,
    );
  }
}

module.exports = {
  initializeCaches,
  loadSimulationData,
  refreshLeagueSourcedTeams,
};
