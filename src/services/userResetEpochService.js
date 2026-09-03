// Durable reset epochs let independent Telegram and agent Function processes
// discard stale per-user caches after a reset completed elsewhere.

const {
  bestTeamsCache,
  constructorsCache,
  currentTeamCache,
  driversCache,
  selectedChipCache,
  userCache,
} = require('../cache');

const RESET_EPOCH_FIELD = 'userResetEpoch';

function normalizeResetEpoch(value) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function getCachedResetEpoch(chatId) {
  return normalizeResetEpoch(userCache[String(chatId)]?.[RESET_EPOCH_FIELD]);
}

function clearUserScopedCaches(chatId, epoch) {
  const key = String(chatId);

  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key][RESET_EPOCH_FIELD] = normalizeResetEpoch(epoch);
  userCache[key].selectedTeam = null;
  userCache[key].bestTeamBudgetChangePointsPerMillion = {};
  userCache[key].selectedBestTeamByTeam = {};
  userCache[key].selectedChipByTeam = {};

  // These helpers invalidate their generation-aware preference refreshes.
  // They are loaded lazily because profile refresh calls this module.
  const {
    setCachedSelectedTeam,
  } = require('./selectTeamService');
  const {
    setCachedRankingPreferences,
  } = require('./setBestTeamRankingService');
  const {
    setCachedChipPreferences,
  } = require('./activateChipService');

  if (typeof setCachedRankingPreferences === 'function') {
    setCachedRankingPreferences(chatId, {}, {}, null);
  }
  if (typeof setCachedChipPreferences === 'function') {
    setCachedChipPreferences(chatId, {}, null);
  }
  if (typeof setCachedSelectedTeam === 'function') {
    setCachedSelectedTeam(chatId, null, { preserveNull: true });
  }

  // The generation-aware helpers preserve this opaque durable marker.
  userCache[key][RESET_EPOCH_FIELD] = normalizeResetEpoch(epoch);
}

function publishUserReset(chatId, epoch) {
  clearUserScopedCaches(chatId, epoch);
}

function reconcileUserResetEpoch(chatId, persistedUser) {
  if (!persistedUser || typeof persistedUser !== 'object') {
    return { changed: false, epoch: getCachedResetEpoch(chatId) };
  }

  const persistedEpoch = normalizeResetEpoch(
    persistedUser[RESET_EPOCH_FIELD],
  );
  const cachedEpoch = getCachedResetEpoch(chatId);

  if (persistedEpoch > cachedEpoch) {
    publishUserReset(chatId, persistedEpoch);

    return { changed: true, epoch: persistedEpoch };
  }

  return { changed: false, epoch: cachedEpoch };
}

module.exports = {
  RESET_EPOCH_FIELD,
  normalizeResetEpoch,
  getCachedResetEpoch,
  publishUserReset,
  reconcileUserResetEpoch,
};
