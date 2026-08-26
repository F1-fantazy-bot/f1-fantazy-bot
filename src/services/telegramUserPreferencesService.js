const {
  refreshLanguagePreference,
} = require('./setLanguageService');
const {
  refreshSelectedTeamPreference,
} = require('./selectTeamService');

async function refreshTelegramUserPreferences(chatId) {
  await Promise.all([
    refreshLanguagePreference(chatId),
    refreshSelectedTeamPreference(chatId),
  ]);
}

module.exports = { refreshTelegramUserPreferences };
