// Pure leaderboard core — fetches a league's standings blob and returns
// a structured response with the user's selected team highlighted via
// `selectedTeamId` so renderers can apply their own bolding/styling.
// Both the Telegram adapter (`commandsHandler/leaderboardHandler.js`)
// and the agent's `get_leaderboard` tool call into this.
//
// Returns a status-tagged result the caller can map onto its preferred
// surface (Telegram HTML message vs. structured JSON for the LLM).

const { getSelectedTeam } = require('../cache');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { buildLeagueTeamId } = require('../utils/teamId');

/**
 * @param {{ chatId: number|string, leagueCode: string }} args
 * @returns {Promise<
 *   | { status: 'ok',
 *       leagueCode: string,
 *       leagueName: string,
 *       leagueId?: number,
 *       memberCount: number|null,
 *       fetchedAt: string|null,
 *       selectedTeamId: string|null,
 *       standings: Array<{
 *         position: number|null,
 *         teamName: string,
 *         userName: string|null,
 *         teamNo: number|null,
 *         teamId: string|null,
 *         totalScore: number|null,
 *         gapToLeader: number|null,
 *         isSelected: boolean
 *       }>
 *     }
 *   | { status: 'not_followed', leagueCode: string }
 *   | { status: 'not_found', leagueCode: string }
 *   | { status: 'invalid_input', leagueCode?: string }
 * >}
 */
async function getLeaderboard({ chatId, leagueCode }) {
  if (!leagueCode || typeof leagueCode !== 'string') {
    return { status: 'invalid_input', leagueCode: leagueCode || null };
  }

  const userLeagues = await listUserLeagues(chatId);
  const follows = (userLeagues || []).some(
    (league) => league.leagueCode === leagueCode,
  );

  if (!follows) {
    return { status: 'not_followed', leagueCode };
  }

  const leagueData = await getLeagueData(leagueCode);
  if (!leagueData) {
    return { status: 'not_found', leagueCode };
  }

  const teams = Array.isArray(leagueData.teams) ? [...leagueData.teams] : [];
  teams.sort((a, b) => (a.position || 0) - (b.position || 0));

  const selectedTeamId = getSelectedTeam(chatId) || null;
  const leaderScore =
    teams.length > 0 && typeof teams[0].totalScore === 'number'
      ? teams[0].totalScore
      : null;

  const standings = teams.map((team) => {
    const position =
      typeof team.position === 'number' && Number.isFinite(team.position)
        ? team.position
        : null;
    const totalScore =
      typeof team.totalScore === 'number' && Number.isFinite(team.totalScore)
        ? team.totalScore
        : null;
    const teamId = buildLeagueTeamId(team.userName, team.teamNo) || null;
    const gapToLeader =
      totalScore !== null && leaderScore !== null
        ? totalScore - leaderScore
        : null;

    return {
      position,
      teamName: team.teamName || team.userName || '—',
      userName: team.userName || null,
      teamNo:
        typeof team.teamNo === 'number' && Number.isFinite(team.teamNo)
          ? team.teamNo
          : null,
      teamId,
      totalScore,
      gapToLeader,
      isSelected: Boolean(teamId && selectedTeamId && teamId === selectedTeamId),
    };
  });

  return {
    status: 'ok',
    leagueCode,
    leagueName: leagueData.leagueName || leagueCode,
    ...(typeof leagueData.leagueId === 'number'
      ? { leagueId: leagueData.leagueId }
      : {}),
    memberCount:
      typeof leagueData.memberCount === 'number'
        ? leagueData.memberCount
        : teams.length,
    fetchedAt: leagueData.fetchedAt || null,
    selectedTeamId,
    standings,
  };
}

module.exports = { getLeaderboard };
