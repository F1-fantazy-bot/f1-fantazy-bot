// Atomic persistence helpers for the per-team selected-best-team JSON map.

const {
  userCache,
  normalizeSelectedBestTeam,
  normalizeSelectedBestTeamByTeam,
  serializeSelectedBestTeamByTeam,
} = require('../cache');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  invalidateBestTeamRankingRefresh,
} = require('./setBestTeamRankingService');

async function mutateSelectedBestTeams({
  chatId,
  mutate,
  attributes = {},
}) {
  let persistedSelections = {};
  await updateUserAttributesAtomically(chatId, (currentUser) => {
    const selections = normalizeSelectedBestTeamByTeam(
      currentUser.selectedBestTeamByTeam,
    );
    persistedSelections =
      mutate(selections) || selections;

    return {
      ...attributes,
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        persistedSelections,
      ),
    };
  });

  invalidateBestTeamRankingRefresh(chatId);
  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedBestTeamByTeam = persistedSelections;

  return persistedSelections;
}

async function setSelectedBestTeamPreference({
  chatId,
  teamId,
  selectedBestTeam,
  attributes,
}) {
  const normalized = normalizeSelectedBestTeam(selectedBestTeam);

  return await mutateSelectedBestTeams({
    chatId,
    attributes,
    mutate: (selections) => {
      if (normalized) {
        selections[teamId] = normalized;
      }

      return selections;
    },
  });
}

async function clearSelectedBestTeamPreference({
  chatId,
  teamId,
  attributes,
}) {
  return await mutateSelectedBestTeams({
    chatId,
    attributes,
    mutate: (selections) => {
      delete selections[teamId];

      return selections;
    },
  });
}

async function retainSelectedBestTeamPreferences({
  chatId,
  teamIds,
  attributes,
}) {
  const allowed = new Set(teamIds);

  return await mutateSelectedBestTeams({
    chatId,
    attributes,
    mutate: (selections) =>
      Object.fromEntries(
        Object.entries(selections).filter(([teamId]) => allowed.has(teamId)),
      ),
  });
}

module.exports = {
  mutateSelectedBestTeams,
  setSelectedBestTeamPreference,
  clearSelectedBestTeamPreference,
  retainSelectedBestTeamPreferences,
};
