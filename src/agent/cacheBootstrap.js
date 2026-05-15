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
// `saveUserTeam` for refreshed league rosters). We hand it a no-op
// "bot" whose `sendMessage` simply resolves — the agent process has no
// Telegram token. Note: cache init still touches Azure Storage (read +
// occasionally write refreshed league teams), so the agent function
// needs the same Azure credentials the bot does.

const { initializeCaches } = require('../cacheInitializer');

let pendingCacheReady = null;

function getNoopBot() {
  return {
    sendMessage: async () => undefined,
  };
}

function ensureCacheReady() {
  if (!pendingCacheReady) {
    pendingCacheReady = initializeCaches(getNoopBot()).catch((err) => {
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
