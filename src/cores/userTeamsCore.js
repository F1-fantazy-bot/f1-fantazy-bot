// Pure user-teams core — enumerates the user's tracked teams plus the
// minimal per-team metadata the LLM needs to resolve a name like "kilzid3"
// to a canonical teamId before calling `get_best_teams`.

const {
  currentTeamCache,
  selectedChipCache,
  isLeagueTeamId,
  getSelectedTeam,
  getUserTeamIds,
} = require('../cache');

function listUserTeams({ chatId }) {
  const teamIds = getUserTeamIds(chatId);
  const selected = getSelectedTeam(chatId);

  return teamIds.map((teamId) => {
    const team = currentTeamCache[chatId]?.[teamId] || {};
    const chip = selectedChipCache[chatId]?.[teamId] || null;

    return {
      teamId,
      teamName: team.teamName || teamId,
      isLeague: isLeagueTeamId(teamId),
      isSelected: selected === teamId,
      chip,
      drivers: Array.isArray(team.drivers) ? [...team.drivers] : [],
      constructors: Array.isArray(team.constructors) ? [...team.constructors] : [],
      boost: team.boost || null,
      freeTransfers:
        typeof team.freeTransfers === 'number' ? team.freeTransfers : null,
      costCapRemaining:
        typeof team.costCapRemaining === 'number'
          ? team.costCapRemaining
          : null,
    };
  });
}

module.exports = { listUserTeams };
