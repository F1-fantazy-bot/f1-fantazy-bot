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
  buildLeagueTeamId,
  buildLegacyLeagueTeamId,
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

  // Refresh league-sourced teams from the latest teams-data blobs and migrate
  // the previous username+teamNo identity to the account-aware
  // username+teamNo+accountId identity. Ambiguous legacy ids are never guessed.
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
 * Refresh league-sourced teams from current teams-data blobs and migrate the
 * previous `{sanitize(userName)}_{teamNo}` id to the account-safe
 * `{sanitize(userName)}_{teamNo}_{accountId}` id.
 *
 * A legacy id is migrated automatically only when it maps to exactly one
 * account-aware team across the user's followed leagues. If multiple accounts
 * share the same legacy id, the old tracked entry is removed and its derived
 * preferences are cleared so the user must explicitly re-select the intended
 * team instead of the bot guessing.
 *
 * Best-effort: missing league data is left untouched and retried next startup.
 */
async function refreshLeagueSourcedTeams(bot) {
  const leagueTeamsByCode = {};
  const userLeagueCodesByChatId = {};
  let refreshed = 0;
  let migrated = 0;
  let ambiguousRemoved = 0;
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
          (league) => league.leagueCode,
        );
      } catch (err) {
        console.error(`Failed to list user leagues for ${chatId}:`, err);
        userLeagueCodesByChatId[chatId] = [];
      }
    }

    return userLeagueCodesByChatId[chatId];
  }

  function movePreferenceKey(map, oldTeamId, newTeamId) {
    const next = { ...map };
    if (Object.prototype.hasOwnProperty.call(next, oldTeamId)) {
      if (
        newTeamId &&
        !Object.prototype.hasOwnProperty.call(next, newTeamId)
      ) {
        next[newTeamId] = next[oldTeamId];
      }
      delete next[oldTeamId];
    }

    return next;
  }

  async function persistPreferenceIdentityChange(
    chatId,
    oldTeamId,
    newTeamId,
  ) {
    const userKey = String(chatId);
    if (!userCache[userKey]) {
      return;
    }

    let ranking = {};
    let selectedBest = {};
    let chips = {};
    let selectedTeam = null;

    await updateUserAttributesAtomically(chatId, (currentUser) => {
      ranking = movePreferenceKey(
        normalizeBestTeamBudgetChangePointsPerMillion(
          currentUser.bestTeamBudgetChangePointsPerMillion,
        ),
        oldTeamId,
        newTeamId,
      );
      selectedBest = movePreferenceKey(
        normalizeSelectedBestTeamByTeam(
          currentUser.selectedBestTeamByTeam,
        ),
        oldTeamId,
        newTeamId,
      );
      chips = movePreferenceKey(
        normalizeSelectedChipByTeam(currentUser.selectedChipByTeam),
        oldTeamId,
        newTeamId,
      );
      selectedTeam =
        currentUser.selectedTeam === oldTeamId
          ? newTeamId || null
          : currentUser.selectedTeam || null;

      return {
        selectedTeam: selectedTeam || null,
        bestTeamBudgetChangePointsPerMillion:
          Object.keys(ranking).length > 0
            ? JSON.stringify(ranking)
            : null,
        selectedBestTeamByTeam:
          serializeSelectedBestTeamByTeam(selectedBest),
        selectedChipByTeam: serializeSelectedChipByTeam(chips),
      };
    });

    const user = userCache[userKey];
    user.selectedTeam = selectedTeam;
    user.bestTeamBudgetChangePointsPerMillion = ranking;
    user.selectedBestTeamByTeam = selectedBest;
    user.selectedChipByTeam = chips;

    if (Object.keys(chips).length > 0) {
      selectedChipCache[chatId] = { ...chips };
    } else {
      delete selectedChipCache[chatId];
    }

    if (
      bestTeamsCache[chatId] &&
      Object.prototype.hasOwnProperty.call(
        bestTeamsCache[chatId],
        oldTeamId,
      )
    ) {
      if (
        newTeamId &&
        !Object.prototype.hasOwnProperty.call(
          bestTeamsCache[chatId],
          newTeamId,
        )
      ) {
        bestTeamsCache[chatId][newTeamId] =
          bestTeamsCache[chatId][oldTeamId];
      }
      delete bestTeamsCache[chatId][oldTeamId];
    }
  }

  for (const [chatId, teamsById] of Object.entries(currentTeamCache)) {
    if (!teamsById || typeof teamsById !== 'object') {
      continue;
    }

    const followedLeagueCodes = await loadFollowedLeagueCodes(chatId);
    const canonicalById = new Map();
    const legacyCandidates = new Map();

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
        const legacyId = buildLegacyLeagueTeamId(
          team.userName,
          team.teamNo,
        );
        if (!canonicalId) {
          continue;
        }

        canonicalById.set(canonicalId, team);
        if (legacyId && legacyId !== canonicalId) {
          if (!legacyCandidates.has(legacyId)) {
            legacyCandidates.set(legacyId, new Map());
          }
          legacyCandidates.get(legacyId).set(canonicalId, team);
        }
      }
    }

    // Snapshot keys because migration mutates the cache object.
    for (const oldTeamId of Object.keys(teamsById)) {
      // Screenshot teams (T1/T2/T3) do not contain an underscore.
      if (!oldTeamId.includes('_')) {
        continue;
      }

      try {
        const exactMatch = canonicalById.get(oldTeamId);
        if (exactMatch) {
          const refreshedTeam = mapLeagueTeamToBotTeam(exactMatch);
          currentTeamCache[chatId][oldTeamId] = refreshedTeam;
          await saveUserTeam(bot, chatId, oldTeamId, refreshedTeam, {
            silent: true,
          });
          refreshed += 1;
          continue;
        }

        const candidates = legacyCandidates.get(oldTeamId);
        if (!candidates || candidates.size === 0) {
          missing += 1;
          continue;
        }

        if (candidates.size > 1) {
          const oldTeamData = currentTeamCache[chatId][oldTeamId];

          // Remove the ambiguous durable team first. If preference cleanup
          // fails, restore the old blob so the migration is retryable.
          await deleteUserTeam(bot, chatId, oldTeamId, { silent: true });
          try {
            await persistPreferenceIdentityChange(
              chatId,
              oldTeamId,
              null,
            );
          } catch (preferenceError) {
            await saveUserTeam(bot, chatId, oldTeamId, oldTeamData, {
              silent: true,
            });
            throw preferenceError;
          }

          delete currentTeamCache[chatId][oldTeamId];
          ambiguousRemoved += 1;
          continue;
        }

        const [[newTeamId, match]] = [...candidates.entries()];
        const refreshedTeam = mapLeagueTeamToBotTeam(match);

        // Persist the new blob before touching the old identity. Preference
        // migration is then committed; failures roll the new blob back.
        await saveUserTeam(bot, chatId, newTeamId, refreshedTeam, {
          silent: true,
        });
        try {
          await persistPreferenceIdentityChange(
            chatId,
            oldTeamId,
            newTeamId,
          );
        } catch (preferenceError) {
          try {
            await deleteUserTeam(bot, chatId, newTeamId, { silent: true });
          } catch (_rollbackError) {
            // A stray new-format blob is harmless; next startup deduplicates.
          }
          throw preferenceError;
        }

        currentTeamCache[chatId][newTeamId] = refreshedTeam;
        delete currentTeamCache[chatId][oldTeamId];

        try {
          await deleteUserTeam(bot, chatId, oldTeamId, { silent: true });
        } catch (deleteError) {
          console.error(
            `Failed to delete migrated team ${oldTeamId} for ${chatId}:`,
            deleteError,
          );
        }

        migrated += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `Failed to refresh/migrate league team ${oldTeamId} for ${chatId}:`,
          err,
        );
      }
    }
  }

  if (
    refreshed > 0 ||
    migrated > 0 ||
    ambiguousRemoved > 0 ||
    missing > 0 ||
    failed > 0
  ) {
    await sendLogMessage(
      bot,
      `League-sourced teams refresh: ${refreshed} refreshed, ${migrated} migrated, ${ambiguousRemoved} ambiguous removed for reselection, ${missing} missing in league, ${failed} failed`,
    );
  }
}

module.exports = {
  initializeCaches,
  loadSimulationData,
  refreshLeagueSourcedTeams,
};
