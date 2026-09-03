const crypto = require('crypto');
const {
  constructorsCache,
  currentTeamCache,
  driversCache,
  userCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedBestTeamByTeam,
  normalizeSelectedChipByTeam,
} = require('../cache');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  captureTeamState,
  restoreTeamStateWithStorage,
} = require('./teamStateSnapshotService');
const { runChipMutation } = require('./activateChipService');
const {
  RESET_EPOCH_FIELD,
  getCachedResetEpoch,
  normalizeResetEpoch,
  publishUserReset,
} = require('./userResetEpochService');

const STATUS = Object.freeze({
  OK: 'ok',
  CHANGED: 'changed',
});

function userResetImpact(chatId) {
  const key = String(chatId);
  const user = userCache[key] || {};
  const teams = currentTeamCache[chatId] || {};
  const ranking = normalizeBestTeamBudgetChangePointsPerMillion(
    user.bestTeamBudgetChangePointsPerMillion,
  );
  const selectedBest = normalizeSelectedBestTeamByTeam(
    user.selectedBestTeamByTeam,
  );
  const chips = normalizeSelectedChipByTeam(user.selectedChipByTeam);

  return {
    teamBlobs: Object.keys(teams).length,
    selectedTeam: typeof user.selectedTeam === 'string' && user.selectedTeam.length > 0,
    rankingPreferences: Object.keys(ranking).length,
    selectedBestTeams: Object.keys(selectedBest).length,
    chipPreferences: Object.keys(chips).length,
    driverProjectionOverride: Boolean(driversCache[chatId]),
    constructorProjectionOverride: Boolean(constructorsCache[chatId]),
  };
}

function resetFingerprint(chatId) {
  const key = String(chatId);
  const user = userCache[key] || {};
  const teamIds = Object.keys(currentTeamCache[chatId] || {}).sort();
  const payload = {
    teamIds,
    selectedTeam: typeof user.selectedTeam === 'string' ? user.selectedTeam : null,
    rankingTeamIds: Object.keys(
      normalizeBestTeamBudgetChangePointsPerMillion(
        user.bestTeamBudgetChangePointsPerMillion,
      ),
    ).sort(),
    selectedBestTeamIds: Object.keys(
      normalizeSelectedBestTeamByTeam(user.selectedBestTeamByTeam),
    ).sort(),
    chipTeamIds: Object.keys(
      normalizeSelectedChipByTeam(user.selectedChipByTeam),
    ).sort(),
    driverProjectionOverride: Boolean(driversCache[chatId]),
    constructorProjectionOverride: Boolean(constructorsCache[chatId]),
    epoch: getCachedResetEpoch(chatId),
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function hasResettableData(impact) {
  return Object.values(impact).some(Boolean);
}

function validatePorts({
  storage,
  runMutation,
  updateAttributes,
  requiresStorageRollback,
}) {
  if (!storage || typeof storage.deleteAllUserTeams !== 'function') {
    throw new TypeError('reset user data service requires deleteAllUserTeams');
  }
  if (requiresStorageRollback && typeof storage.saveUserTeam !== 'function') {
    throw new TypeError('reset user data service requires saveUserTeam');
  }
  if (typeof runMutation !== 'function') {
    throw new TypeError('reset user data service requires runMutation');
  }
  if (typeof updateAttributes !== 'function') {
    throw new TypeError('reset user data service requires updateAttributes');
  }
}

// The service deliberately accepts only business/storage ports. Telegram and
// CopilotKit concerns belong in their small adapters.
function createResetUserDataService({
  storage,
  runMutation = runChipMutation,
  updateAttributes = updateUserAttributesAtomically,
  captureState = captureTeamState,
  restoreState,
  publishReset = publishUserReset,
} = {}) {
  validatePorts({
    storage,
    runMutation,
    updateAttributes,
    requiresStorageRollback: !restoreState,
  });

  const restore = restoreState || (async (chatId, snapshot) =>
    await restoreTeamStateWithStorage(chatId, snapshot, storage));

  async function inspect({ chatId }) {
    return await runMutation(chatId, async () => {
      const impact = userResetImpact(chatId);

      return {
        impact,
        fingerprint: resetFingerprint(chatId),
        hasResettableData: hasResettableData(impact),
      };
    });
  }

  async function reset({ chatId, expectedFingerprint } = {}) {
    return await runMutation(chatId, async () => {
      const impact = userResetImpact(chatId);
      const fingerprint = resetFingerprint(chatId);
      if (expectedFingerprint && expectedFingerprint !== fingerprint) {
        return {
          status: STATUS.CHANGED,
          impact,
          fingerprint,
        };
      }

      const snapshot = captureState(chatId);
      try {
        await storage.deleteAllUserTeams(chatId);
        // Keep the legacy preference CAS shape intact for Telegram while the
        // second CAS publishes the cross-process invalidation marker. Both
        // writes remain inside the same durable user lease; any failure rolls
        // back the deleted blobs and the first CAS through the snapshot.
        await updateAttributes(chatId, () => ({
          selectedTeam: null,
          bestTeamBudgetChangePointsPerMillion: null,
          selectedBestTeamByTeam: null,
          selectedChipByTeam: null,
        }));
        let nextEpoch;
        await updateAttributes(chatId, (currentUser) => {
          nextEpoch = normalizeResetEpoch(currentUser[RESET_EPOCH_FIELD]) + 1;

          return {
            [RESET_EPOCH_FIELD]: nextEpoch,
          };
        });

        // Publish only after every durable write has succeeded. Other
        // processes observe the increment through their normal profile refresh.
        publishReset(chatId, nextEpoch);

        return {
          status: STATUS.OK,
          impact,
          epoch: nextEpoch,
        };
      } catch (error) {
        await restore(chatId, snapshot);
        throw error;
      }
    });
  }

  return { inspect, reset };
}

module.exports = {
  STATUS,
  userResetImpact,
  resetFingerprint,
  hasResettableData,
  createResetUserDataService,
};
