const {
  refreshLanguagePreference,
} = require('./setLanguageService');
const {
  refreshSelectedTeamPreference,
} = require('./selectTeamService');
const {
  refreshBestTeamRankingPreferences,
} = require('./setBestTeamRankingService');

async function refreshTelegramUserPreferences(chatId) {
  await Promise.all([
    refreshLanguagePreference(chatId),
    refreshSelectedTeamPreference(chatId),
    refreshBestTeamRankingPreferences(chatId),
  ]);
}

module.exports = { refreshTelegramUserPreferences };
