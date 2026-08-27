// Shared effectful per-team chip preference service.

const { AsyncLocalStorage } = require('async_hooks');
const { t } = require('../i18n');
const {
  bestTeamsCache,
  selectedChipCache,
  userCache,
  normalizeSelectedChipByTeam,
  serializeSelectedChipByTeam,
  normalizeSelectedBestTeamByTeam,
  serializeSelectedBestTeamByTeam,
  getUserTeamIds,
} = require('../cache');
const { getUserTeam } = require('../azureStorageService');
const {
  EXTRA_BOOST_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
  WITHOUT_CHIP,
} = require('../constants');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  resolveTeamSelection,
} = require('./selectTeamService');
const {
  invalidateBestTeamRankingRefresh,
} = require('./setBestTeamRankingService');
const {
  getFreshUserProfile,
  invalidateUserProfileRefresh,
  USER_PROFILE_REFRESH_TIMEOUT_MS,
} = require('./userProfileSyncService');
const {
  withUserMutationLock,
} = require('./userMutationLockService');
const {
  hydrateUserMutationState,
} = require('./userMutationHydrationService');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
});

const CHIP_OPTIONS = Object.freeze([
  { chip: EXTRA_BOOST_CHIP, labelKey: 'Extra Boost' },
  { chip: LIMITLESS_CHIP, labelKey: 'Limitless' },
  { chip: WILDCARD_CHIP, labelKey: 'Wildcard' },
  { chip: WITHOUT_CHIP, labelKey: 'Without Chip' },
]);

const chipGenerations = new Map();
const inFlightChipRefreshes = new Map();
const chipMutationQueues = new Map();
const chipMutationContext = new AsyncLocalStorage();

async function runChipMutation(chatId, operation) {
  const key = String(chatId);
  if (chipMutationContext.getStore()?.has(key)) {
    return await operation();
  }
  const previous = chipMutationQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(() =>
    chipMutationContext.run(new Set([key]), () =>
      withUserMutationLock(chatId, async () => {
        if (process.env.NODE_ENV !== 'test') {
          await hydrateUserMutationState(chatId);
        }

        return await operation();
      }),
    ),
  );
  chipMutationQueues.set(key, current);

  try {
    return await current;
  } finally {
    if (chipMutationQueues.get(key) === current) {
      chipMutationQueues.delete(key);
    }
  }
}

function generationFor(chatId) {
  return chipGenerations.get(String(chatId)) || 0;
}

function advanceGeneration(chatId) {
  const key = String(chatId);
  const next = generationFor(chatId) + 1;
  chipGenerations.set(key, next);

  return next;
}

function getChipOption(chip) {
  return CHIP_OPTIONS.find((option) => option.chip === chip) || null;
}

function availableChips(chatId) {
  return CHIP_OPTIONS.map((option) => ({
    chip: option.chip,
    label: t(option.labelKey, chatId),
  }));
}

function effectiveChip(chips, teamId) {
  return chips[teamId] || WITHOUT_CHIP;
}

function invalidateTeamBestTeams(chatId, teamId) {
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }
}

function invalidateChipRefresh(chatId) {
  inFlightChipRefreshes.delete(String(chatId));
  invalidateUserProfileRefresh(chatId);
  advanceGeneration(chatId);
}

function setCachedChipPreferences(chatId, chips, changedTeamId) {
  const key = String(chatId);
  const previous = normalizeSelectedChipByTeam(
    userCache[key]?.selectedChipByTeam,
  );
  const next = normalizeSelectedChipByTeam(chips);
  invalidateChipRefresh(chatId);

  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedChipByTeam = next;
  if (Object.keys(next).length > 0) {
    selectedChipCache[chatId] = { ...next };
  } else {
    delete selectedChipCache[chatId];
  }

  const teamIds = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
    ...(changedTeamId ? [changedTeamId] : []),
  ]);
  for (const teamId of teamIds) {
    if (
      teamId === changedTeamId ||
      effectiveChip(previous, teamId) !== effectiveChip(next, teamId)
    ) {
      invalidateTeamBestTeams(chatId, teamId);
    }
  }
}

async function refreshChipPreferences(
  chatId,
  { timeoutMs = USER_PROFILE_REFRESH_TIMEOUT_MS } = {},
) {
  const key = String(chatId);
  const existing = inFlightChipRefreshes.get(key);
  if (existing) {
    return await existing;
  }

  const refresh = (async () => {
    const generation = advanceGeneration(chatId);
    const user = await getFreshUserProfile(chatId, { timeoutMs });
    if (!user || generationFor(chatId) !== generation) {
      return {
        fresh: false,
        chips: normalizeSelectedChipByTeam(
          userCache[key]?.selectedChipByTeam,
        ),
      };
    }

    const ownedTeamIds = new Set(getUserTeamIds(chatId));
    const persisted = Object.fromEntries(
      Object.entries(
        normalizeSelectedChipByTeam(user.selectedChipByTeam),
      ).filter(([teamId]) => ownedTeamIds.has(teamId)),
    );
    const previous = normalizeSelectedChipByTeam(
      userCache[key]?.selectedChipByTeam,
    );
    if (!userCache[key]) {
      userCache[key] = {};
    }
    userCache[key].selectedChipByTeam = persisted;
    if (Object.keys(persisted).length > 0) {
      selectedChipCache[chatId] = { ...persisted };
    } else {
      delete selectedChipCache[chatId];
    }

    const teamIds = new Set([
      ...Object.keys(previous),
      ...Object.keys(persisted),
    ]);
    for (const teamId of teamIds) {
      if (
        effectiveChip(previous, teamId) !==
        effectiveChip(persisted, teamId)
      ) {
        invalidateTeamBestTeams(chatId, teamId);
      }
    }

    return { fresh: true, chips: persisted };
  })();

  inFlightChipRefreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    if (inFlightChipRefreshes.get(key) === refresh) {
      inFlightChipRefreshes.delete(key);
    }
  }
}

async function getFreshChipPreference(chatId, teamId) {
  try {
    const result = await refreshChipPreferences(chatId);

    return {
      fresh: result.fresh,
      chip: effectiveChip(result.chips, teamId),
    };
  } catch (err) {
    console.error('Error refreshing chip preferences:', err);

    return {
      fresh: false,
      chip: effectiveChip(
        normalizeSelectedChipByTeam(
          userCache[String(chatId)]?.selectedChipByTeam,
        ),
        teamId,
      ),
    };
  }
}

async function refreshChipPreferencesSafely(chatId) {
  try {
    return await refreshChipPreferences(chatId);
  } catch (err) {
    console.error('Error refreshing chip preferences:', err);

    return {
      fresh: false,
      chips: normalizeSelectedChipByTeam(
        userCache[String(chatId)]?.selectedChipByTeam,
      ),
    };
  }
}

async function activateChipPreferenceInternal({
  chatId,
  teamId,
  teamName,
  chip,
}) {
  const resolvedTeam = resolveTeamSelection({ chatId, teamId, teamName });
  if (resolvedTeam.status !== STATUS.OK) {
    return resolvedTeam;
  }
  const chipOption = getChipOption(chip);
  if (!chipOption) {
    return {
      status: STATUS.INVALID_INPUT,
      summary: t(
        'Chip {CHIP} is not available. Available chips: {CHIPS}.',
        chatId,
        {
          CHIP: chip || '—',
          CHIPS: availableChips(chatId)
            .map((option) => `${option.label} (${option.chip})`)
            .join(', '),
        },
      ),
      chip,
      availableChips: availableChips(chatId),
    };
  }
  if (!await getUserTeam(chatId, resolvedTeam.teamId)) {
    return {
      status: STATUS.INVALID_INPUT,
      summary: t(
        'Team {TEAM} is no longer available. No chip change was kept.',
        chatId,
        { TEAM: resolvedTeam.teamName },
      ),
      teamId: resolvedTeam.teamId,
    };
  }

  let chips;
  let selectedBestTeamByTeam;
  let changed = false;
  const hadCachedBestTeams = Boolean(
    bestTeamsCache[chatId]?.[resolvedTeam.teamId]?.bestTeams,
  );

  await updateUserAttributesAtomically(chatId, (currentUser) => {
    chips = normalizeSelectedChipByTeam(currentUser.selectedChipByTeam);
    selectedBestTeamByTeam = normalizeSelectedBestTeamByTeam(
      currentUser.selectedBestTeamByTeam,
    );
    changed = effectiveChip(chips, resolvedTeam.teamId) !== chip;
    if (!changed) {
      return null;
    }

    if (chip === WITHOUT_CHIP) {
      delete chips[resolvedTeam.teamId];
    } else {
      chips[resolvedTeam.teamId] = chip;
    }
    delete selectedBestTeamByTeam[resolvedTeam.teamId];

    return {
      selectedChipByTeam: serializeSelectedChipByTeam(chips),
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        selectedBestTeamByTeam,
      ),
    };
  });

  if (changed && !await getUserTeam(chatId, resolvedTeam.teamId)) {
    await clearTeamDerivedPreferencesInternal({
      chatId,
      teamId: resolvedTeam.teamId,
    });

    return {
      status: STATUS.INVALID_INPUT,
      summary: t(
        'Team {TEAM} is no longer available. No chip change was kept.',
        chatId,
        { TEAM: resolvedTeam.teamName },
      ),
      teamId: resolvedTeam.teamId,
    };
  }

  setCachedChipPreferences(
    chatId,
    chips,
    changed ? resolvedTeam.teamId : null,
  );
  if (changed) {
    if (!userCache[String(chatId)]) {
      userCache[String(chatId)] = {};
    }
    userCache[String(chatId)].selectedBestTeamByTeam =
      selectedBestTeamByTeam;
    invalidateBestTeamRankingRefresh(chatId);
  }

  const chipLabel = t(chipOption.labelKey, chatId);

  return {
    status: STATUS.OK,
    summary: changed
      ? t('Chip for {TEAM} set to {CHIP}.', chatId, {
          TEAM: resolvedTeam.teamName,
          CHIP: chipLabel,
        })
      : t('Chip for {TEAM} is already {CHIP}.', chatId, {
          TEAM: resolvedTeam.teamName,
          CHIP: chipLabel,
        }),
    teamId: resolvedTeam.teamId,
    teamName: resolvedTeam.teamName,
    chip,
    chipLabel,
    changed,
    invalidatedBestTeams: changed && hadCachedBestTeams,
  };
}

async function clearTeamDerivedPreferencesInternal({
  chatId,
  teamId,
  attributes = {},
}) {
  let chips;
  let selectedBestTeamByTeam;
  await updateUserAttributesAtomically(chatId, (currentUser) => {
    chips = normalizeSelectedChipByTeam(currentUser.selectedChipByTeam);
    selectedBestTeamByTeam = normalizeSelectedBestTeamByTeam(
      currentUser.selectedBestTeamByTeam,
    );
    delete chips[teamId];
    delete selectedBestTeamByTeam[teamId];

    return {
      ...attributes,
      selectedChipByTeam: serializeSelectedChipByTeam(chips),
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        selectedBestTeamByTeam,
      ),
    };
  });

  setCachedChipPreferences(chatId, chips, teamId);
  if (!userCache[String(chatId)]) {
    userCache[String(chatId)] = {};
  }
  userCache[String(chatId)].selectedBestTeamByTeam =
    selectedBestTeamByTeam;
  invalidateBestTeamRankingRefresh(chatId);

  return { chips, selectedBestTeamByTeam };
}

async function clearAllTeamDerivedPreferencesInternal({
  chatId,
  attributes = {},
}) {
  await updateUserAttributesAtomically(chatId, () => ({
    ...attributes,
    selectedChipByTeam: null,
    selectedBestTeamByTeam: null,
  }));
  setCachedChipPreferences(chatId, {}, null);
  if (!userCache[String(chatId)]) {
    userCache[String(chatId)] = {};
  }
  userCache[String(chatId)].selectedBestTeamByTeam = {};
  invalidateBestTeamRankingRefresh(chatId);
}

async function activateChipPreference(args) {
  return await runChipMutation(args.chatId, () =>
    activateChipPreferenceInternal(args),
  );
}

async function clearTeamDerivedPreferences(args) {
  return await runChipMutation(args.chatId, () =>
    clearTeamDerivedPreferencesInternal(args),
  );
}

async function clearAllTeamDerivedPreferences(args) {
  return await runChipMutation(args.chatId, () =>
    clearAllTeamDerivedPreferencesInternal(args),
  );
}

function resetChipSyncForTests() {
  chipGenerations.clear();
  inFlightChipRefreshes.clear();
  chipMutationQueues.clear();
}

module.exports = {
  CHIP_OPTIONS,
  runChipMutation,
  getChipOption,
  availableChips,
  setCachedChipPreferences,
  invalidateChipRefresh,
  refreshChipPreferences,
  refreshChipPreferencesSafely,
  getFreshChipPreference,
  activateChipPreference,
  clearTeamDerivedPreferences,
  clearAllTeamDerivedPreferences,
  clearAllTeamDerivedPreferencesInternal,
  resetChipSyncForTests,
  STATUS,
};
