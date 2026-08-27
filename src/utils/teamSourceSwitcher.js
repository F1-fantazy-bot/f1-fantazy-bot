const azureStorageService = require('../azureStorageService');
const {
  currentTeamCache,
  bestTeamsCache,
  getUserLeagueTeamIds,
  getUserScreenshotTeamIds,
} = require('../cache');
const {
  setCachedSelectedTeam,
} = require('../services/selectTeamService');
const {
  runChipMutation,
  clearAllTeamDerivedPreferencesInternal,
} = require('../services/activateChipService');

/**
 * Wipe every cached team for a user (blob + in-memory), including chip,
 * best-team and selected-best-team state. Also clears selectedTeam in
 * userCache. Chip and selected-best state are persisted here; the caller is
 * responsible for persisting selectedTeam afterwards if needed.
 *
 * @param {Object} bot - Telegram bot instance (required for blob delete logs)
 * @param {string|number} chatId
 */
async function wipeAllTeams(bot, chatId) {
  await runChipMutation(chatId, async () => {
    const previousTeams = { ...(currentTeamCache[chatId] || {}) };
    try {
      await azureStorageService.deleteAllUserTeams(bot, chatId);
      await clearAllTeamDerivedPreferencesInternal({ chatId });
    } catch (err) {
      try {
        await azureStorageService.deleteAllUserTeams(bot, chatId);
        for (const [teamId, teamData] of Object.entries(previousTeams)) {
          await azureStorageService.saveUserTeam(
            bot,
            chatId,
            teamId,
            teamData,
          );
        }
      } catch (rollbackErr) {
        console.error(
          `Failed to restore teams after source wipe for ${chatId}:`,
          rollbackErr,
        );
      }
      throw err;
    }

    delete currentTeamCache[chatId];
    delete bestTeamsCache[chatId];
    setCachedSelectedTeam(chatId, null);
  });
}

/**
 * Ensure the user's cache only contains league-sourced teams. If any
 * screenshot (T1/T2/T3) team is present, wipe everything. Returns true when
 * a wipe happened.
 *
 * @param {Object} bot
 * @param {string|number} chatId
 * @returns {Promise<boolean>}
 */
async function ensureSourceIsLeague(bot, chatId) {
  if (getUserScreenshotTeamIds(chatId).length === 0) {
    return false;
  }

  await wipeAllTeams(bot, chatId);

  return true;
}

/**
 * Ensure the user's cache only contains screenshot-sourced teams. If any
 * league team is present, wipe everything. Returns true when a wipe
 * happened.
 *
 * @param {Object} bot
 * @param {string|number} chatId
 * @returns {Promise<boolean>}
 */
async function ensureSourceIsScreenshot(bot, chatId) {
  if (getUserLeagueTeamIds(chatId).length === 0) {
    return false;
  }

  await wipeAllTeams(bot, chatId);

  return true;
}

module.exports = {
  wipeAllTeams,
  ensureSourceIsLeague,
  ensureSourceIsScreenshot,
};
