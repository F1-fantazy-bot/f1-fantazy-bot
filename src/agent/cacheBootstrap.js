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
const { refreshLeagueSourcedTeams } = require('../cacheInitializer');
const { currentTeamCache, isLeagueTeamId } = require('../cache');
const { getNotifierBot } = require('./notifierBot');

let pendingCacheReady = null;
const pendingUserRefresh = new Map();

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

// The test agent can start before a newly deployed scraper finishes writing
// accountId. Recheck legacy IDs on reads so a warm instance can migrate them
// after the weekly blob becomes available, without requiring an app restart.
async function ensureCurrentUserIdentity(chatId, { refreshCanonical = false } = {}) {
  await ensureCacheReady();
  const key = String(chatId);
  const needsRefresh = Object.keys(currentTeamCache[key] || {}).some(
    (teamId) => isLeagueTeamId(teamId) &&
      (refreshCanonical || !/_\d+_[a-f0-9]{12}$/i.test(teamId)),
  );
  if (!needsRefresh) {
    return;
  }
  if (!pendingUserRefresh.has(key)) {
    // Serialize roster hydration with follow/remove/reset operations so a
    // read cannot restore a team concurrently removed by another surface.
    const { runChipMutation } = require('../services/activateChipService');
    const refresh = runChipMutation(chatId, () =>
      refreshLeagueSourcedTeams(getNotifierBot(), key))
      .finally(() => pendingUserRefresh.delete(key));
    pendingUserRefresh.set(key, refresh);
  }
  await pendingUserRefresh.get(key);
}

function resetCacheReadyForTests() {
  pendingCacheReady = null;
  pendingUserRefresh.clear();
}

module.exports = { ensureCacheReady, ensureCurrentUserIdentity, resetCacheReadyForTests };
