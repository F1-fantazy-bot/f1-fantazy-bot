// Pure current-team core — no `bot`, no `t()`, no `sendMessage`. Both the
// Telegram adapter (`commandsHandler/currentTeamInfoHandler.js`) and the
// web-chat agent tool (`agent/tools.js`) call into this.
//
// Status-tagged result: 'ok' / 'no_teams' / 'unknown_team' /
// 'ambiguous_team' / 'missing_cache'.
//
// Team resolution mirrors `bestTeamsCore.pickTeamId` so all team-resolving
// agent tools behave identically.

// IMPORTANT: import calc helpers via `'../utils'` (NOT `'../utils/utils'`).
// `currentTeamInfoHandler.test.js` does `jest.mock('../utils', () => ({
//   calculateTeamInfo: ..., calculateBudgetAdjustedPoints: ... }))` and
// the mock only intercepts the bare `'../utils'` path.
const { calculateTeamInfo, calculateBudgetAdjustedPoints } = require('../utils');
const {
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  remainingRaceCountCache,
  nextRaceInfoCache,
  pricesCache,
  getSelectedTeam,
  getUserTeamIds,
  getBestTeamBudgetChangePointsPerMillion,
  getDriversForChat,
  getConstructorsForChat,
} = require('../cache');
const { prepareBestTeamsData } = require('../utils/bestTeamsData');

function pickTeamId({ chatId, requestedTeamId, requestedTeamName }) {
  const teamIds = getUserTeamIds(chatId);
  if (teamIds.length === 0) {
    return { status: 'no_teams' };
  }

  if (requestedTeamId) {
    if (!teamIds.includes(requestedTeamId)) {
      return { status: 'unknown_team', teamId: requestedTeamId, teamIds };
    }

    return { status: 'ok', teamId: requestedTeamId };
  }

  if (requestedTeamName) {
    const matches = teamIds.filter(
      (id) => currentTeamCache[chatId]?.[id]?.teamName === requestedTeamName,
    );
    if (matches.length === 1) {
      return { status: 'ok', teamId: matches[0] };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous_team', teamIds: matches };
    }

    return { status: 'unknown_team', teamName: requestedTeamName, teamIds };
  }

  if (teamIds.length === 1) {
    return { status: 'ok', teamId: teamIds[0] };
  }

  const selected = getSelectedTeam(chatId);
  if (selected && teamIds.includes(selected)) {
    return { status: 'ok', teamId: selected };
  }

  return { status: 'ambiguous_team', teamIds };
}

async function getCurrentTeam({ chatId, teamId, teamName } = {}) {
  const pick = pickTeamId({
    chatId,
    requestedTeamId: teamId,
    requestedTeamName: teamName,
  });
  if (pick.status !== 'ok') {
    return pick;
  }

  const resolvedTeamId = pick.teamId;
  const drivers = getDriversForChat(chatId);
  const constructors = getConstructorsForChat(chatId);
  const currentTeam = currentTeamCache[chatId]?.[resolvedTeamId];

  if (!drivers || !constructors || !currentTeam) {
    return {
      status: 'missing_cache',
      teamId: resolvedTeamId,
      missing: {
        drivers: !drivers,
        constructors: !constructors,
        currentTeam: !currentTeam,
      },
    };
  }

  const prepared = prepareBestTeamsData({
    drivers,
    constructors,
    currentTeam,
    driverEntries: pricesCache.driverEntries,
    nextRaceInfo: nextRaceInfoCache[sharedKey],
  });
  if (prepared.status !== 'ok') {
    return { ...prepared, teamId: resolvedTeamId };
  }
  const calculationData = prepared.calculationData;
  const teamInfo = calculateTeamInfo(
    calculationData.CurrentTeam,
    calculationData.Drivers,
    calculationData.Constructors,
  );
  const budgetChangePointsPerMillion = getBestTeamBudgetChangePointsPerMillion(
    chatId,
    resolvedTeamId,
  );
  const remainingRaceCount = remainingRaceCountCache[sharedKey];
  const budgetAdjustedPoints = calculateBudgetAdjustedPoints(
    teamInfo.teamExpectedPoints,
    teamInfo.teamPriceChange,
    budgetChangePointsPerMillion,
    remainingRaceCount,
  );

  return {
    status: 'ok',
    teamId: resolvedTeamId,
    teamName: currentTeam.teamName || null,
    chip: selectedChipCache[chatId]?.[resolvedTeamId] || null,
    drivers: currentTeam.drivers,
    constructors: currentTeam.constructors,
    boostDriver: currentTeam.boostDriver || null,
    extraBoostDriver: currentTeam.extraBoostDriver || null,
    freeTransfers: currentTeam.freeTransfers ?? null,
    teamInfo: {
      totalPrice: teamInfo.totalPrice,
      costCapRemaining: teamInfo.costCapRemaining,
      overallBudget: teamInfo.overallBudget,
      teamExpectedPoints: teamInfo.teamExpectedPoints,
      teamPriceChange: teamInfo.teamPriceChange,
    },
    budgetChangePointsPerMillion,
    budgetAdjustedPoints:
      budgetChangePointsPerMillion > 0 ? budgetAdjustedPoints : null,
    remainingRaceCount: remainingRaceCount ?? null,
  };
}

module.exports = { getCurrentTeam, pickTeamId };
