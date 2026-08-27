const azureStorageService = require('../azureStorageService');
const {
  bestTeamsCache,
  currentTeamCache,
  userCache,
  getSelectedTeam,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedBestTeamByTeam,
  serializeSelectedBestTeamByTeam,
  normalizeSelectedChipByTeam,
  serializeSelectedChipByTeam,
} = require('../cache');
const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const {
  setCachedSelectedTeam,
} = require('./selectTeamService');
const {
  setCachedRankingPreferences,
} = require('./setBestTeamRankingService');
const {
  setCachedChipPreferences,
} = require('./activateChipService');

function captureTeamState(chatId) {
  const key = String(chatId);

  return {
    teams: { ...(currentTeamCache[chatId] || {}) },
    bestTeams: { ...(bestTeamsCache[chatId] || {}) },
    selectedTeam: getSelectedTeam(chatId),
    ranking: normalizeBestTeamBudgetChangePointsPerMillion(
      userCache[key]?.bestTeamBudgetChangePointsPerMillion,
    ),
    selectedBest: normalizeSelectedBestTeamByTeam(
      userCache[key]?.selectedBestTeamByTeam,
    ),
    chips: normalizeSelectedChipByTeam(
      userCache[key]?.selectedChipByTeam,
    ),
  };
}

async function restoreTeamState(bot, chatId, snapshot) {
  await azureStorageService.deleteAllUserTeams(bot, chatId);
  for (const [teamId, teamData] of Object.entries(snapshot.teams)) {
    await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);
  }
  await updateUserAttributesAtomically(chatId, () => ({
    selectedTeam: snapshot.selectedTeam,
    bestTeamBudgetChangePointsPerMillion:
      Object.keys(snapshot.ranking).length > 0
        ? JSON.stringify(snapshot.ranking)
        : null,
    selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
      snapshot.selectedBest,
    ),
    selectedChipByTeam: serializeSelectedChipByTeam(snapshot.chips),
  }));

  if (Object.keys(snapshot.teams).length > 0) {
    currentTeamCache[chatId] = { ...snapshot.teams };
  } else {
    delete currentTeamCache[chatId];
  }
  if (Object.keys(snapshot.bestTeams).length > 0) {
    bestTeamsCache[chatId] = { ...snapshot.bestTeams };
  } else {
    delete bestTeamsCache[chatId];
  }
  setCachedRankingPreferences(
    chatId,
    snapshot.ranking,
    snapshot.selectedBest,
    null,
  );
  setCachedChipPreferences(chatId, snapshot.chips, null);
  setCachedSelectedTeam(chatId, snapshot.selectedTeam, {
    preserveNull: true,
  });
}

module.exports = { captureTeamState, restoreTeamState };
