const azureStorageService = require('../azureStorageService');
const {
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
  clearAllSelectedBestTeams,
  getUserLeagueTeamIds,
  getUserScreenshotTeamIds,
} = require('../cache');

/**
 * Wipe every cached team for a user (blob + in-memory), including chip,
 * best-team and selected-best-team state. Also clears selectedTeam in
 * userCache. Caller is responsible for persisting userCache via
 * updateUserAttributes() afterwards if needed.
 *
 * @param {Object} bot - Telegram bot instance (required for blob delete logs)
 * @param {string|number} chatId
 */
async function wipeAllTeams(bot, chatId) {
  try {
    await azureStorageService.deleteAllUserTeams(bot, chatId);
  } catch (err) {
    console.error('Error deleting existing user teams:', err);
  }

  delete currentTeamCache[chatId];
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  const key = String(chatId);
  if (userCache[key]) {
    delete userCache[key].selectedTeam;
  }
  clearAllSelectedBestTeams(chatId);
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
