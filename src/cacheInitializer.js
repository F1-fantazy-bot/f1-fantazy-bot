const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationInfoCache,
  sharedKey,
  nextRaceInfoCache,
  userCache,
  remainingRaceCountCache,
  bestTeamsCache,
  selectedChipCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedBestTeamByTeam,
  serializeSelectedBestTeamByTeam,
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
  deleteUserTeam,
} = require('./azureStorageService');
const { listAllUsers, updateUserAttributes } = require('./userRegistryService');
const { fetchRemainingRaceCount } = require('./raceScheduleService');
const {
  sanitizeIdSegment,
  buildLeagueTeamId,
} = require('./utils/teamId');
const { listUserLeagues } = require('./leagueRegistryService');
const { mapLeagueTeamToBotTeam } = require('./utils/leagueTeamHelpers');

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

/**
 * For any cached team in league format, re-fetch the league's teams-data.json
 * and replace the cached data (and the persisted blob) with the latest
 * roster/budget/transfers for that team.
 *
 * This pass ALSO performs the one-time migration from the legacy league-scoped
 * teamId (`{leagueCode}_{sanitizedTeamName}`) to the new league-agnostic
 * fantasy teamId (`{sanitize(userName)}_{teamNo}`). Detection rule: a teamId
 * is in legacy format iff its prefix (split at the first `_`) matches one of
 * the user's followed leagueCodes; otherwise it's already in the new format.
 *
 * Best-effort: errors for individual leagues or teams are logged but do not
 * abort cache initialization. Failed migrations leave the old entry in place;
 * retried on next startup.
 *
 * @todo PR B (`feature/doronkilzi/remove-fantasy-id-migration`) deletes the
 * legacy-detection + migration branch of this function.
 */
async function refreshLeagueSourcedTeams(bot) {
  const leagueTeamsByCode = {};
  const userLeagueCodesByChatId = {};
  let refreshed = 0;
  let missing = 0;
  let failed = 0;
  let migrated = 0;
  let migrationConflicts = 0;

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
        userLeagueCodesByChatId[chatId] = new Set(
          (leagues || []).map((l) => l.leagueCode),
        );
      } catch (err) {
        console.error(`Failed to list user leagues for ${chatId}:`, err);
        userLeagueCodesByChatId[chatId] = new Set();
      }
    }

    return userLeagueCodesByChatId[chatId];
  }

  for (const [chatId, teamsById] of Object.entries(currentTeamCache)) {
    if (!teamsById || typeof teamsById !== 'object') {continue;}

    const userKey = String(chatId);
    const followedLeagueCodes = await loadFollowedLeagueCodes(chatId);

    // Snapshot keys up-front — we mutate `teamsById` during the loop.
    const teamIds = Object.keys(teamsById);

    for (const oldTeamId of teamIds) {
      const underscoreIdx = oldTeamId.indexOf('_');
      if (underscoreIdx <= 0) {continue;} // screenshot team (T1/T2/T3)

      const prefix = oldTeamId.slice(0, underscoreIdx);
      const isLegacyFormat = followedLeagueCodes.has(prefix);

      try {
        if (isLegacyFormat) {
          // ---- Legacy → new-format migration path ----
          const leagueCode = prefix;
          const sanitizedSlug = oldTeamId.slice(underscoreIdx + 1);
          const data = await loadLeagueTeams(leagueCode);

          if (!data || !Array.isArray(data.teams)) {
            missing += 1;
            continue; // retry next startup
          }

          const match = data.teams.find(
            (team) => sanitizeIdSegment(team.teamName) === sanitizedSlug,
          );

          if (!match) {
            missing += 1;
            continue;
          }

          const newTeamId = buildLeagueTeamId(match.userName, match.teamNo);
          if (!newTeamId) {
            // Upstream blob still missing teamNo (legacy api-data).
            // Refresh in place under the old id; retry on next startup.
            const refreshedTeam = mapLeagueTeamToBotTeam(match);
            currentTeamCache[chatId][oldTeamId] = refreshedTeam;
            try {
              await saveUserTeam(bot, chatId, oldTeamId, refreshedTeam, {
                silent: true,
              });
            } catch (saveErr) {
              console.error(
                `Failed to persist refreshed legacy team ${oldTeamId} for ${chatId}:`,
                saveErr,
              );
            }
            refreshed += 1;
            continue;
          }

          const refreshedTeam = mapLeagueTeamToBotTeam(match);

          // Save new blob first; if that fails, abort migration for this
          // entry (leave old blob/cache intact for retry).
          try {
            await saveUserTeam(bot, chatId, newTeamId, refreshedTeam, {
              silent: true,
            });
          } catch (saveErr) {
            console.error(
              `Failed to save migrated team blob ${newTeamId} for ${chatId}:`,
              saveErr,
            );
            failed += 1;
            continue;
          }

          // Move in-memory caches (dedup on collision — same fantasy id
          // already followed via another league).
          const collision =
            currentTeamCache[chatId][newTeamId] !== undefined &&
            newTeamId !== oldTeamId;
          if (collision) {
            migrationConflicts += 1;
          } else {
            currentTeamCache[chatId][newTeamId] = refreshedTeam;
          }
          delete currentTeamCache[chatId][oldTeamId];

          if (bestTeamsCache[chatId] && oldTeamId in bestTeamsCache[chatId]) {
            if (!(newTeamId in bestTeamsCache[chatId])) {
              bestTeamsCache[chatId][newTeamId] = bestTeamsCache[chatId][oldTeamId];
            }
            delete bestTeamsCache[chatId][oldTeamId];
          }

          if (
            selectedChipCache[chatId] &&
            oldTeamId in selectedChipCache[chatId]
          ) {
            if (!(newTeamId in selectedChipCache[chatId])) {
              selectedChipCache[chatId][newTeamId] =
                selectedChipCache[chatId][oldTeamId];
            }
            delete selectedChipCache[chatId][oldTeamId];
          }

          // userCache: rename selectedTeam if it points at the old id, and
          // rename keys inside selectedBestTeamByTeam.
          if (userCache[userKey]) {
            if (userCache[userKey].selectedTeam === oldTeamId) {
              userCache[userKey].selectedTeam = newTeamId;
            }
            const sbtbt = normalizeSelectedBestTeamByTeam(
              userCache[userKey].selectedBestTeamByTeam,
            );
            if (oldTeamId in sbtbt) {
              if (!(newTeamId in sbtbt)) {
                sbtbt[newTeamId] = sbtbt[oldTeamId];
              }
              delete sbtbt[oldTeamId];
              userCache[userKey].selectedBestTeamByTeam = sbtbt;
            }
          }

          // Delete the old blob. Failure here leaves a stray blob but the
          // cache is already consistent; tolerate.
          try {
            await deleteUserTeam(bot, chatId, oldTeamId, { silent: true });
          } catch (delErr) {
            console.error(
              `Failed to delete legacy blob ${oldTeamId} for ${chatId} (cache already migrated):`,
              delErr,
            );
          }

          migrated += 1;
          continue;
        }

        // ---- New-format in-place refresh path ----
        // Parse the new id: `{sanitizedUserName}_{teamNo}`. We can't
        // recover the raw userName from the sanitized form, so we match
        // by rebuilding the id from each candidate team and comparing.
        const lastUnderscoreIdx = oldTeamId.lastIndexOf('_');
        if (lastUnderscoreIdx <= 0) {continue;}

        // Try refreshing from each followed league until we find a match.
        let foundMatch = null;
        for (const leagueCode of followedLeagueCodes) {
          const data = await loadLeagueTeams(leagueCode);
          if (!data || !Array.isArray(data.teams)) {continue;}

          const match = data.teams.find(
            (team) =>
              buildLeagueTeamId(team.userName, team.teamNo) === oldTeamId,
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
      } catch (err) {
        failed += 1;
        console.error(
          `Failed to refresh league-sourced team ${oldTeamId} for ${chatId}:`,
          err,
        );
      }
    }

    // Persist userCache changes for this chatId if migration touched them.
    if (userCache[userKey]) {
      try {
        await updateUserAttributes(chatId, {
          selectedTeam: userCache[userKey].selectedTeam || null,
          selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
            userCache[userKey].selectedBestTeamByTeam,
          ),
        });
      } catch (err) {
        console.error(
          `Failed to persist migrated user attributes for ${chatId}:`,
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
    migrationConflicts > 0
  ) {
    const migrationNote =
      migrated > 0 || migrationConflicts > 0
        ? `, ${migrated} migrated to new id format (${migrationConflicts} dedup'd)`
        : '';
    await sendLogMessage(
      bot,
      `League-sourced teams refresh: ${refreshed} refreshed, ${missing} missing in league, ${failed} failed${migrationNote}`,
    );
  }
}

module.exports = {
  initializeCaches,
  loadSimulationData,
  refreshLeagueSourcedTeams,
};
