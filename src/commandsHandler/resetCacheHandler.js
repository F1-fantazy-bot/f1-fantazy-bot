const azureStorageService = require('../azureStorageService');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
} = require('../cache');
const { t } = require('../i18n');
const {
  setCachedSelectedTeam,
} = require('../services/selectTeamService');
const {
  setCachedRankingPreferences,
} = require('../services/setBestTeamRankingService');

async function resetCacheForChat(chatId, bot) {
  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  await azureStorageService.deleteAllUserTeams(bot, chatId);
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  await updateUserAttributesAtomically(chatId, () => ({
    selectedTeam: null,
    bestTeamBudgetChangePointsPerMillion: null,
    selectedBestTeamByTeam: null,
  }));
  setCachedRankingPreferences(chatId, {}, {}, null);
  setCachedSelectedTeam(chatId, null, { preserveNull: true });

  await bot
    .sendMessage(chatId, t('Cache has been reset for your chat.', chatId))
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

module.exports = { resetCacheForChat };
