const {
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  normalizeSelectedBestTeamByTeam,
  normalizeSelectedChipByTeam,
  DEFAULT_BEST_TEAM_BUDGET_CHANGE_POINTS_PER_MILLION,
} = require('../cache');
const { listUserTeamData } = require('../azureStorageService');
const { getUserById } = require('../userRegistryService');

function filterOwned(map, ownedTeamIds) {
  return Object.fromEntries(
    Object.entries(map).filter(([teamId]) => ownedTeamIds.has(teamId)),
  );
}

async function hydrateUserMutationState(chatId) {
  const key = String(chatId);
  const previousTeams = { ...(currentTeamCache[chatId] || {}) };
  const previousRanking = normalizeBestTeamBudgetChangePointsPerMillion(
    userCache[key]?.bestTeamBudgetChangePointsPerMillion,
  );
  const previousChips = normalizeSelectedChipByTeam(
    userCache[key]?.selectedChipByTeam,
  );
  const [teams, user] = await Promise.all([
    listUserTeamData(chatId),
    getUserById(chatId),
  ]);
  const ownedTeamIds = new Set(Object.keys(teams));
  currentTeamCache[chatId] = teams;

  if (!userCache[key]) {
    userCache[key] = {};
  }
  if (user) {
    Object.assign(userCache[key], user);
  }
  userCache[key].bestTeamBudgetChangePointsPerMillion = filterOwned(
    normalizeBestTeamBudgetChangePointsPerMillion(
      user?.bestTeamBudgetChangePointsPerMillion,
    ),
    ownedTeamIds,
  );
  userCache[key].selectedBestTeamByTeam = filterOwned(
    normalizeSelectedBestTeamByTeam(user?.selectedBestTeamByTeam),
    ownedTeamIds,
  );
  userCache[key].selectedChipByTeam = filterOwned(
    normalizeSelectedChipByTeam(user?.selectedChipByTeam),
    ownedTeamIds,
  );
  if (
    typeof user?.selectedTeam === 'string' &&
    ownedTeamIds.has(user.selectedTeam)
  ) {
    userCache[key].selectedTeam = user.selectedTeam;
  } else {
    delete userCache[key].selectedTeam;
  }
  if (Object.keys(userCache[key].selectedChipByTeam).length > 0) {
    selectedChipCache[chatId] = {
      ...userCache[key].selectedChipByTeam,
    };
  } else {
    delete selectedChipCache[chatId];
  }

  const nextRanking = userCache[key].bestTeamBudgetChangePointsPerMillion;
  const nextChips = userCache[key].selectedChipByTeam;
  const teamIds = new Set([
    ...Object.keys(previousTeams),
    ...Object.keys(teams),
    ...Object.keys(previousRanking),
    ...Object.keys(nextRanking),
    ...Object.keys(previousChips),
    ...Object.keys(nextChips),
  ]);
  for (const teamId of teamIds) {
    const previousRankingValue =
      previousRanking[teamId] ??
      DEFAULT_BEST_TEAM_BUDGET_CHANGE_POINTS_PER_MILLION;
    const nextRankingValue =
      nextRanking[teamId] ??
      DEFAULT_BEST_TEAM_BUDGET_CHANGE_POINTS_PER_MILLION;
    if (
      JSON.stringify(previousTeams[teamId] || null) !==
        JSON.stringify(teams[teamId] || null) ||
      (previousChips[teamId] || null) !== (nextChips[teamId] || null) ||
      previousRankingValue !== nextRankingValue
    ) {
      if (bestTeamsCache[chatId]) {
        delete bestTeamsCache[chatId][teamId];
      }
    }
  }
  if (
    bestTeamsCache[chatId] &&
    Object.keys(bestTeamsCache[chatId]).length === 0
  ) {
    delete bestTeamsCache[chatId];
  }

  return { teams, user: userCache[key] };
}

module.exports = { hydrateUserMutationState };
