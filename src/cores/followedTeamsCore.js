// Pure followed-teams core — enumerates the user's tracked league teams,
// enriched with the leagues each team appears in plus the team's current
// position in each. Both the agent's `list_followed_teams` tool and any
// future Telegram surface call into this.
//
// Returns a status-tagged result: status === 'ok' carries `teams`, which
// is an array of `{ teamId, teamName, leagues: [{ leagueCode, leagueName,
// position }], isSelected }` entries deduplicated by teamId. Non-league
// teams (`T1`/`T2`/`T3` screenshot ids) are excluded — the followed-teams
// concept is specific to league tracking.

const {
  currentTeamCache,
  isLeagueTeamId,
  getSelectedTeam,
  getUserTeamIds,
} = require('../cache');
const { listUserLeagues } = require('../leagueRegistryService');
const { loadLeagueTeamsData } = require('../utils/leagueTeamHelpers');
const { buildLeagueTeamId } = require('../utils/teamId');

/**
 * @param {{ chatId: number|string }} args
 * @returns {Promise<
 *   | { status: 'ok', teams: Array<{
 *       teamId: string,
 *       teamName: string,
 *       leagues: Array<{ leagueCode: string, leagueName: string, position: number|null }>,
 *       isSelected: boolean
 *     }> }
 *   | { status: 'empty' }
 * >}
 */
async function listFollowedTeams({ chatId }) {
  const leagueTeamIds = getUserTeamIds(chatId).filter(isLeagueTeamId);

  if (leagueTeamIds.length === 0) {
    return { status: 'empty' };
  }

  const userLeagues = await listUserLeagues(chatId);
  const leagueNameByCode = {};
  for (const league of userLeagues || []) {
    leagueNameByCode[league.leagueCode] =
      league.leagueName || league.leagueCode;
  }

  // Fetch each followed league's teams-data.json once (memoized) so we can
  // resolve each tracked team's position in every league it appears in.
  const leagueDataByCode = {};
  await Promise.all(
    (userLeagues || []).map(async (league) => {
      try {
        const data = await loadLeagueTeamsData(league.leagueCode);
        if (data && Array.isArray(data.teams)) {
          leagueDataByCode[league.leagueCode] = data;
        }
      } catch (err) {
        // Per repo convention: log and swallow per-league failures so one
        // missing blob doesn't blank out the whole list.
        console.error(
          `Error loading teams-data.json for league ${league.leagueCode}:`,
          err,
        );
      }
    }),
  );

  const selected = getSelectedTeam(chatId);
  const trackedTeamIds = new Set(leagueTeamIds);

  // Build a teamId -> { teamName, leagues:[...] } map by scanning every
  // followed league's roster. A team's id (`{sanitize(userName)}_{teamNo}`)
  // is league-agnostic, so the same fantasy team in two leagues collapses
  // into one entry with two `leagues[]` rows.
  const byTeamId = {};
  for (const [leagueCode, data] of Object.entries(leagueDataByCode)) {
    const leagueName = leagueNameByCode[leagueCode] || leagueCode;
    for (const row of data.teams) {
      const teamId = buildLeagueTeamId(row.userName, row.teamNo);
      if (!teamId || !trackedTeamIds.has(teamId)) {
        continue;
      }

      if (!byTeamId[teamId]) {
        const cached = currentTeamCache[chatId]?.[teamId];
        byTeamId[teamId] = {
          teamId,
          teamName: row.teamName || cached?.teamName || teamId,
          leagues: [],
          isSelected: selected === teamId,
        };
      }
      const position =
        typeof row.position === 'number' && Number.isFinite(row.position)
          ? row.position
          : null;
      byTeamId[teamId].leagues.push({ leagueCode, leagueName, position });
    }
  }

  // Surface tracked teams even when none of their leagues' blobs resolved
  // (or none of the user's currently-followed leagues actually contain the
  // team — e.g. unfollowed-league residue). Without this they'd silently
  // drop out of the list.
  for (const teamId of leagueTeamIds) {
    if (!byTeamId[teamId]) {
      const cached = currentTeamCache[chatId]?.[teamId];
      byTeamId[teamId] = {
        teamId,
        teamName: cached?.teamName || teamId,
        leagues: [],
        isSelected: selected === teamId,
      };
    }
  }

  const teams = Object.values(byTeamId).sort((a, b) =>
    a.teamName.localeCompare(b.teamName),
  );

  return { status: 'ok', teams };
}

module.exports = { listFollowedTeams };
