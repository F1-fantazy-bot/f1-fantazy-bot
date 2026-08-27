// Shared effectful active-team preference service.
//
// Telegram's TEAM callback and the web-agent select_team write tool use this
// module for ownership validation, durable persistence, local cache mutation,
// no-op detection, and cross-process hydration.

const { t } = require('../i18n');
const {
  userCache,
  getSelectedTeam,
  getUserTeamIds,
  getTeamDisplayName,
} = require('../cache');
const { updateUserAttributes } = require('../userRegistryService');
const { getUserTeam } = require('../azureStorageService');
const {
  getFreshUserProfile,
  invalidateUserProfileRefresh,
  USER_PROFILE_REFRESH_TIMEOUT_MS,
} = require('./userProfileSyncService');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
});

const selectedTeamGenerations = new Map();
const inFlightSelectedTeamRefreshes = new Map();

function generationFor(chatId) {
  return selectedTeamGenerations.get(String(chatId)) || 0;
}

function advanceGeneration(chatId) {
  const key = String(chatId);
  const next = generationFor(chatId) + 1;
  selectedTeamGenerations.set(key, next);

  return next;
}

function setCachedSelectedTeam(chatId, teamId, { preserveNull = false } = {}) {
  const key = String(chatId);

  // A refresh that starts after this mutation must not coalesce onto a
  // UserRegistry request that began before it.
  inFlightSelectedTeamRefreshes.delete(key);
  invalidateUserProfileRefresh(chatId);
  advanceGeneration(chatId);

  if (!userCache[key]) {
    userCache[key] = {};
  }
  if (typeof teamId === 'string' && teamId.length > 0) {
    userCache[key].selectedTeam = teamId;
  } else if (preserveNull) {
    userCache[key].selectedTeam = null;
  } else {
    delete userCache[key].selectedTeam;
  }
}

function listSelectableTeams(chatId) {
  return getUserTeamIds(chatId).map((teamId) => ({
    teamId,
    teamName: getTeamDisplayName(chatId, teamId) || teamId,
  }));
}

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolveTeamSelection({ chatId, teamId, teamName }) {
  const teams = listSelectableTeams(chatId);
  let matches = [];

  if (teamId) {
    matches = teams.filter((team) => team.teamId === teamId);
  } else if (teamName) {
    const target = normalize(teamName);
    matches = teams.filter(
      (team) =>
        normalize(team.teamName) === target ||
        normalize(team.teamId) === target,
    );
  }

  if (matches.length === 1) {
    return { status: STATUS.OK, ...matches[0], availableTeams: teams };
  }

  const requested = teamId || teamName || '';

  return {
    status: STATUS.INVALID_INPUT,
    summary: t(
      'Team {TEAM} is not available. Available teams: {TEAMS}',
      chatId,
      {
        TEAM: requested || '—',
        TEAMS:
          teams.map((team) => `${team.teamName} (${team.teamId})`).join(', ') ||
          '—',
      },
    ),
    requested,
    availableTeams: teams,
    ambiguous: matches.length > 1,
  };
}

async function resolveFreshTeamSelection({ chatId, teamId, teamName }) {
  const {
    runChipMutation,
  } = require('./activateChipService');

  return await runChipMutation(chatId, () =>
    resolveTeamSelection({ chatId, teamId, teamName }),
  );
}

async function refreshSelectedTeamPreference(
  chatId,
  { timeoutMs = USER_PROFILE_REFRESH_TIMEOUT_MS } = {},
) {
  const key = String(chatId);
  const existing = inFlightSelectedTeamRefreshes.get(key);
  if (existing) {
    return await existing;
  }

  const refresh = (async () => {
    const generation = advanceGeneration(chatId);
    const user = await getFreshUserProfile(chatId, { timeoutMs });
    if (generationFor(chatId) !== generation) {
      return { fresh: false, selectedTeam: getSelectedTeam(chatId) };
    }

    const availableIds = new Set(getUserTeamIds(chatId));
    const persisted =
      typeof user?.selectedTeam === 'string' &&
      availableIds.has(user.selectedTeam)
        ? user.selectedTeam
        : null;
    if (!userCache[key]) {
      userCache[key] = {};
    }
    if (persisted) {
      userCache[key].selectedTeam = persisted;
    } else {
      delete userCache[key].selectedTeam;
    }

    return { fresh: true, selectedTeam: persisted };
  })();

  inFlightSelectedTeamRefreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    if (inFlightSelectedTeamRefreshes.get(key) === refresh) {
      inFlightSelectedTeamRefreshes.delete(key);
    }
  }
}

async function getFreshSelectedTeamPreference(chatId) {
  try {
    return await refreshSelectedTeamPreference(chatId);
  } catch (err) {
    console.error('Error refreshing selected-team preference:', err);

    return { fresh: false, selectedTeam: getSelectedTeam(chatId) };
  }
}

async function selectTeamPreferenceInternal({ chatId, teamId, teamName }) {
  const resolved = resolveTeamSelection({ chatId, teamId, teamName });
  if (resolved.status !== STATUS.OK) {
    return resolved;
  }
  if (!await getUserTeam(chatId, resolved.teamId)) {
    return {
      status: STATUS.INVALID_INPUT,
      summary: t(
        'Team {TEAM} is no longer available.',
        chatId,
        { TEAM: resolved.teamName },
      ),
      teamId: resolved.teamId,
    };
  }

  await updateUserAttributes(chatId, { selectedTeam: resolved.teamId });
  setCachedSelectedTeam(chatId, resolved.teamId);

  return {
    status: STATUS.OK,
    summary: t('Active team switched to {TEAM}.', chatId, {
      TEAM: resolved.teamName,
    }),
    teamId: resolved.teamId,
    teamName: resolved.teamName,
    changed: true,
  };
}

async function selectTeamPreference(args) {
  // Lazy import avoids a module cycle: activateChipService uses the
  // ownership resolver above, while the coordinator covers this mutation.
  const {
    runChipMutation,
  } = require('./activateChipService');

  return await runChipMutation(args.chatId, () =>
    selectTeamPreferenceInternal(args),
  );
}

function resetSelectedTeamSyncForTests() {
  selectedTeamGenerations.clear();
  inFlightSelectedTeamRefreshes.clear();
}

module.exports = {
  listSelectableTeams,
  resolveTeamSelection,
  resolveFreshTeamSelection,
  setCachedSelectedTeam,
  refreshSelectedTeamPreference,
  getFreshSelectedTeamPreference,
  selectTeamPreference,
  resetSelectedTeamSyncForTests,
  STATUS,
};
