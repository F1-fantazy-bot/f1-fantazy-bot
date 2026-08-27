const {
  refreshLanguagePreference,
} = require('./setLanguageService');
const {
  refreshSelectedTeamPreference,
} = require('./selectTeamService');
const {
  refreshBestTeamRankingPreferences,
} = require('./setBestTeamRankingService');
const {
  refreshChipPreferences,
} = require('./activateChipService');

async function refreshTelegramUserPreferences(chatId) {
  await Promise.all([
    refreshLanguagePreference(chatId),
    refreshSelectedTeamPreference(chatId),
    refreshBestTeamRankingPreferences(chatId),
    refreshChipPreferences(chatId),
  ]);
}

module.exports = { refreshTelegramUserPreferences };
