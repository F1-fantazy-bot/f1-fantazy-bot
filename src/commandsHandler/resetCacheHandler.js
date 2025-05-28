const azureStorageService = require('../azureStorageService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
} = require('../cache');

async function resetCacheForChat(chatId, bot) {
  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  await azureStorageService.deleteUserTeam(bot, chatId);
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  await bot
    .sendMessage(chatId, 'Cache has been reset for your chat.')
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

module.exports = { resetCacheForChat };
