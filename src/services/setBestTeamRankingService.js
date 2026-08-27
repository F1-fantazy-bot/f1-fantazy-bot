// Shared effectful best-team ranking preference service.
//
// Telegram's ranking callback and the web-agent write tool use this module
// for preset/team validation, durable persistence, cache mutation, no-op
// detection, and cross-process hydration.

const { t } = require('../i18n');
const {
  bestTeamsCache,
  userCache,
  DEFAULT_BEST_TEAM_BUDGET_CHANGE_POINTS_PER_MILLION,
  getBestTeamBudgetChangePointsPerMillion,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedBestTeamByTeam,
  serializeSelectedBestTeamByTeam,
} = require('../cache');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  resolveTeamSelection,
} = require('./selectTeamService');
const {
  getFreshUserProfile,
  invalidateUserProfileRefresh,
  USER_PROFILE_REFRESH_TIMEOUT_MS,
} = require('./userProfileSyncService');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
});

const BEST_TEAM_RANKING_PRESETS = Object.freeze([
  {
    id: 'pure_points',
    budgetChangePointsPerMillion: 0,
    icon: '🎯',
    labelKey: 'Pure Points',
  },
  {
    id: 'points_lean',
    budgetChangePointsPerMillion: 1.3,
    icon: '⚖️',
    labelKey: 'Points Lean',
  },
  {
    id: 'points_plus_budget',
    budgetChangePointsPerMillion: 1.65,
    icon: '📊',
    labelKey: 'Points Plus Budget',
  },
  {
    id: 'balanced_budget_value',
    budgetChangePointsPerMillion: 2,
    icon: '🤝',
    labelKey: 'Balanced Budget Value',
  },
]);

const rankingGenerations = new Map();
const inFlightRankingRefreshes = new Map();

function generationFor(chatId) {
  return rankingGenerations.get(String(chatId)) || 0;
}

function advanceGeneration(chatId) {
  const key = String(chatId);
  const next = generationFor(chatId) + 1;
  rankingGenerations.set(key, next);

  return next;
}

function invalidateBestTeamRankingRefresh(chatId) {
  inFlightRankingRefreshes.delete(String(chatId));
  invalidateUserProfileRefresh(chatId);
  advanceGeneration(chatId);
}

function getPreset(presetId) {
  return BEST_TEAM_RANKING_PRESETS.find(
    (preset) => preset.id === presetId,
  ) || null;
}

function availablePresets(chatId) {
  return BEST_TEAM_RANKING_PRESETS.map((preset) => ({
    id: preset.id,
    label: t(preset.labelKey, chatId),
    value: preset.budgetChangePointsPerMillion,
  }));
}

function invalidPresetResult(chatId, presetId) {
  const presets = availablePresets(chatId);

  return {
    status: STATUS.INVALID_INPUT,
    summary: t(
      'Ranking preset {PRESET} is not available. Available presets: {PRESETS}.',
      chatId,
      {
        PRESET: presetId || '—',
        PRESETS: presets
          .map((preset) => `${preset.label} (${preset.id})`)
          .join(', '),
      },
    ),
    presetId,
    availablePresets: presets,
  };
}

function invalidateTeamBestTeams(chatId, teamId) {
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }
}

function effectivePreference(preferences, teamId) {
  return Object.prototype.hasOwnProperty.call(preferences, teamId)
    ? preferences[teamId]
    : DEFAULT_BEST_TEAM_BUDGET_CHANGE_POINTS_PER_MILLION;
}

function setCachedRankingPreferences(
  chatId,
  preferences,
  selectedBestTeamByTeam,
  changedTeamId,
) {
  const key = String(chatId);
  invalidateBestTeamRankingRefresh(chatId);

  if (!userCache[key]) {
    userCache[key] = {};
  }
  const previous = normalizeBestTeamBudgetChangePointsPerMillion(
    userCache[key].bestTeamBudgetChangePointsPerMillion,
  );
  const next = normalizeBestTeamBudgetChangePointsPerMillion(preferences);
  userCache[key].bestTeamBudgetChangePointsPerMillion = next;
  userCache[key].selectedBestTeamByTeam =
    normalizeSelectedBestTeamByTeam(selectedBestTeamByTeam);
  const teamIds = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
    ...(changedTeamId ? [changedTeamId] : []),
  ]);
  for (const teamId of teamIds) {
    if (
      teamId === changedTeamId ||
      effectivePreference(previous, teamId) !==
        effectivePreference(next, teamId)
    ) {
      invalidateTeamBestTeams(chatId, teamId);
    }
  }
}

async function refreshBestTeamRankingPreferences(
  chatId,
  { timeoutMs = USER_PROFILE_REFRESH_TIMEOUT_MS } = {},
) {
  const key = String(chatId);
  const existing = inFlightRankingRefreshes.get(key);
  if (existing) {
    return await existing;
  }

  const refresh = (async () => {
    const generation = advanceGeneration(chatId);
    const user = await getFreshUserProfile(chatId, { timeoutMs });
    if (!user || generationFor(chatId) !== generation) {
      return {
        fresh: false,
        preferences: normalizeBestTeamBudgetChangePointsPerMillion(
          userCache[key]?.bestTeamBudgetChangePointsPerMillion,
        ),
      };
    }

    const previous = normalizeBestTeamBudgetChangePointsPerMillion(
      userCache[key]?.bestTeamBudgetChangePointsPerMillion,
    );
    const persisted = normalizeBestTeamBudgetChangePointsPerMillion(
      user.bestTeamBudgetChangePointsPerMillion,
    );
    const selectedBestTeamByTeam = normalizeSelectedBestTeamByTeam(
      user.selectedBestTeamByTeam,
    );

    if (!userCache[key]) {
      userCache[key] = {};
    }
    userCache[key].bestTeamBudgetChangePointsPerMillion = persisted;
    userCache[key].selectedBestTeamByTeam = selectedBestTeamByTeam;

    const teamIds = new Set([
      ...Object.keys(previous),
      ...Object.keys(persisted),
    ]);
    for (const teamId of teamIds) {
      if (previous[teamId] !== persisted[teamId]) {
        invalidateTeamBestTeams(chatId, teamId);
      }
    }

    return { fresh: true, preferences: persisted };
  })();

  inFlightRankingRefreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    if (inFlightRankingRefreshes.get(key) === refresh) {
      inFlightRankingRefreshes.delete(key);
    }
  }
}

async function getFreshBestTeamRankingPreference(chatId, teamId) {
  try {
    const result = await refreshBestTeamRankingPreferences(chatId);

    return {
      fresh: result.fresh,
      value: getBestTeamBudgetChangePointsPerMillion(chatId, teamId),
    };
  } catch (err) {
    console.error('Error refreshing best-team ranking preferences:', err);

    return {
      fresh: false,
      value: getBestTeamBudgetChangePointsPerMillion(chatId, teamId),
    };
  }
}

async function refreshBestTeamRankingPreferencesSafely(chatId) {
  try {
    return await refreshBestTeamRankingPreferences(chatId);
  } catch (err) {
    console.error('Error refreshing best-team ranking preferences:', err);

    return {
      fresh: false,
      preferences: normalizeBestTeamBudgetChangePointsPerMillion(
        userCache[String(chatId)]?.bestTeamBudgetChangePointsPerMillion,
      ),
    };
  }
}

async function setBestTeamRankingPreferenceInternal({
  chatId,
  teamId,
  teamName,
  presetId,
}) {
  const resolvedTeam = resolveTeamSelection({ chatId, teamId, teamName });
  if (resolvedTeam.status !== STATUS.OK) {
    return resolvedTeam;
  }
  const preset = getPreset(presetId);
  if (!preset) {
    return invalidPresetResult(chatId, presetId);
  }

  let preferences;
  let selectedBestTeamByTeam;
  let changed = false;

  await updateUserAttributesAtomically(chatId, (currentUser) => {
    preferences = normalizeBestTeamBudgetChangePointsPerMillion(
      currentUser.bestTeamBudgetChangePointsPerMillion,
    );
    selectedBestTeamByTeam = normalizeSelectedBestTeamByTeam(
      currentUser.selectedBestTeamByTeam,
    );
    changed =
      effectivePreference(preferences, resolvedTeam.teamId) !==
      preset.budgetChangePointsPerMillion;

    if (!changed) {
      return null;
    }

    preferences[resolvedTeam.teamId] =
      preset.budgetChangePointsPerMillion;
    delete selectedBestTeamByTeam[resolvedTeam.teamId];

    return {
      bestTeamBudgetChangePointsPerMillion: JSON.stringify(preferences),
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        selectedBestTeamByTeam,
      ),
    };
  });

  if (!changed) {
    setCachedRankingPreferences(
      chatId,
      preferences,
      selectedBestTeamByTeam,
      null,
    );

    return {
      status: STATUS.OK,
      summary: t(
        'Best-team ranking for {TEAM} is already {LABEL} ({VALUE} pts per 1M per remaining race).',
        chatId,
        {
          TEAM: resolvedTeam.teamName,
          LABEL: t(preset.labelKey, chatId),
          VALUE: preset.budgetChangePointsPerMillion,
        },
      ),
      teamId: resolvedTeam.teamId,
      teamName: resolvedTeam.teamName,
      presetId: preset.id,
      label: t(preset.labelKey, chatId),
      value: preset.budgetChangePointsPerMillion,
      changed: false,
    };
  }

  setCachedRankingPreferences(
    chatId,
    preferences,
    selectedBestTeamByTeam,
    resolvedTeam.teamId,
  );

  return {
    status: STATUS.OK,
    summary: t(
      'Best-team ranking set: {LABEL} ({VALUE} pts per 1M per remaining race).',
      chatId,
      {
        LABEL: t(preset.labelKey, chatId),
        VALUE: preset.budgetChangePointsPerMillion,
      },
    ),
    teamId: resolvedTeam.teamId,
    teamName: resolvedTeam.teamName,
    presetId: preset.id,
    label: t(preset.labelKey, chatId),
    value: preset.budgetChangePointsPerMillion,
    changed: true,
  };
}

async function setBestTeamRankingPreference(args) {
  // Lazy import avoids a module cycle: activateChipService invalidates
  // ranking refreshes, while ranking writes share its mutation coordinator.
  const {
    runChipMutation,
  } = require('./activateChipService');

  return await runChipMutation(args.chatId, () =>
    setBestTeamRankingPreferenceInternal(args),
  );
}

function resetBestTeamRankingSyncForTests() {
  rankingGenerations.clear();
  inFlightRankingRefreshes.clear();
}

module.exports = {
  BEST_TEAM_RANKING_PRESETS,
  getPreset,
  availablePresets,
  invalidPresetResult,
  setCachedRankingPreferences,
  invalidateBestTeamRankingRefresh,
  refreshBestTeamRankingPreferences,
  refreshBestTeamRankingPreferencesSafely,
  getFreshBestTeamRankingPreference,
  setBestTeamRankingPreference,
  resetBestTeamRankingSyncForTests,
  STATUS,
};
