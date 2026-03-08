const azureStorageService = require('../azureStorageService');
const { updateUserAttributes } = require('../userRegistryService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
} = require('../cache');
const { t } = require('../i18n');

async function resetCacheForChat(chatId, bot) {
  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  await azureStorageService.deleteAllUserTeams(bot, chatId);
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  // Clear selected team
  const key = String(chatId);
  if (userCache[key]) {
    userCache[key].selectedTeam = null;
  }
  await updateUserAttributes(chatId, { selectedTeam: null });

  await bot
    .sendMessage(chatId, t('Cache has been reset for your chat.', chatId))
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

module.exports = { resetCacheForChat };
