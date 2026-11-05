const { currentTeamCache } = require('../cache');
const { buildLeagueTeamCallbackKey } = require('./teamId');

function selectorForTeam(chatId, teamId) {
  if (/^T[1-3]$/.test(teamId)) {return teamId;}
  const team = currentTeamCache[chatId]?.[teamId];

  return buildLeagueTeamCallbackKey(team?.userName, team?.teamNo, team?.accountId);
}

function resolveTeamSelector(chatId, selector) {
  const matches = Object.keys(currentTeamCache[chatId] || {}).filter(
    (teamId) => selectorForTeam(chatId, teamId) === selector,
  );

  return matches.length === 1 ? matches[0] : null;
}

module.exports = { selectorForTeam, resolveTeamSelector };
