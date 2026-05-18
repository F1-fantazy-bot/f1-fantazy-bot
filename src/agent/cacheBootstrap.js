// Lazy cache bootstrap for the web-chat agent.
//
// In the Telegram process, `bot.js` calls `initializeCaches(bot)` at
// startup so every command handler can read from `driversCache`,
// `currentTeamCache`, etc. The agent function runs in a separate process
// (Azure Function App) and must populate the same in-memory caches
// before its tools can answer questions.
//
// `initializeCaches(bot)` only uses `bot` for the logging side-effects
// (`sendLogMessage`, `sendErrorMessage`, `sendMessageToAdmins`, and
// `saveUserTeam` for refreshed league rosters). We hand it the same
// notifier bot the token-usage middleware uses — a non-polling
// `TelegramBot` instance when `TELEGRAM_BOT_TOKEN` is set, or a noop
// otherwise — so cache init logs land in the same Telegram channels as
// the main bot.

const { initializeCaches } = require('../cacheInitializer');
const { getNotifierBot } = require('./notifierBot');

let pendingCacheReady = null;

function ensureCacheReady() {
  if (!pendingCacheReady) {
    pendingCacheReady = initializeCaches(getNotifierBot()).catch((err) => {
      // Reset on failure so the next tool invocation retries from
      // scratch (transient Azure errors should not brick the agent
      // until the process restarts).
      pendingCacheReady = null;
      console.error('Agent cache initialization failed:', err);
      throw err;
    });
  }

  return pendingCacheReady;
}

function resetCacheReadyForTests() {
  pendingCacheReady = null;
}

module.exports = { ensureCacheReady, resetCacheReadyForTests };
