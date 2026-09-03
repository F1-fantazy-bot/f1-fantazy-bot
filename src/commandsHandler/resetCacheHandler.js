const { t } = require('../i18n');
const {
  restoreTeamState,
} = require('../services/teamStateSnapshotService');
const {
  createResetUserDataService,
} = require('../services/resetUserDataService');
const azureStorageService = require('../azureStorageService');

function resetServiceForTelegram(bot) {
  const storage = {
    deleteAllUserTeams: (chatId) =>
      azureStorageService.deleteAllUserTeams(bot, chatId),
    saveUserTeam: (chatId, teamId, teamData) =>
      azureStorageService.saveUserTeam(bot, chatId, teamId, teamData),
  };

  return createResetUserDataService({
    storage,
    restoreState: (chatId, snapshot) => restoreTeamState(bot, chatId, snapshot),
  });
}

async function resetCacheForChat(chatId, bot) {
  await resetServiceForTelegram(bot).reset({ chatId });

  await bot
    .sendMessage(chatId, t('Cache has been reset for your chat.', chatId))
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

module.exports = { resetCacheForChat };
