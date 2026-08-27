const azureStorageService = require('../azureStorageService');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
} = require('../cache');
const { t } = require('../i18n');
const {
  setCachedSelectedTeam,
} = require('../services/selectTeamService');
const {
  setCachedRankingPreferences,
} = require('../services/setBestTeamRankingService');
const {
  setCachedChipPreferences,
  runChipMutation,
} = require('../services/activateChipService');
const {
  captureTeamState,
  restoreTeamState,
} = require('../services/teamStateSnapshotService');

async function resetCacheForChatInternal(chatId, bot) {
  const snapshot = captureTeamState(chatId);
  try {
    await azureStorageService.deleteAllUserTeams(bot, chatId);
    await updateUserAttributesAtomically(chatId, () => ({
      selectedTeam: null,
      bestTeamBudgetChangePointsPerMillion: null,
      selectedBestTeamByTeam: null,
      selectedChipByTeam: null,
    }));
  } catch (err) {
    await restoreTeamState(bot, chatId, snapshot);
    throw err;
  }

  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  delete bestTeamsCache[chatId];
  setCachedRankingPreferences(chatId, {}, {}, null);
  setCachedSelectedTeam(chatId, null, { preserveNull: true });
  setCachedChipPreferences(chatId, {}, null);

  await bot
    .sendMessage(chatId, t('Cache has been reset for your chat.', chatId))
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

async function resetCacheForChat(chatId, bot) {
  return await runChipMutation(chatId, () =>
    resetCacheForChatInternal(chatId, bot),
  );
}

module.exports = { resetCacheForChat };
