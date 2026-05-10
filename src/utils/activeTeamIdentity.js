const { getSelectedTeam } = require('../cache');
const { loadLeagueTeamsData, extractLeagueCode } = require('./leagueTeamHelpers');
const { buildTeamId } = require('./teamId');

/**
 * Build the cross-league fantasy identifier `{userName}_{teamNo}` for a team
 * pulled from a league JSON blob. Returns `null` when either field is
 * missing (older blobs scraped before teamNo was persisted) so callers can
 * skip the cross-league comparison without false-positive collisions.
 *
 * @param {Object|null|undefined} team
 * @returns {string|null}
 */
function buildFantasyId(team) {
  if (!team || typeof team !== 'object') {
    return null;
  }
  const userName = team.userName;
  const teamNo = team.teamNo;
  if (typeof userName !== 'string' || userName.length === 0) {
    return null;
  }
  if (teamNo === null || teamNo === undefined) {
    return null;
  }

  return `${userName}_${teamNo}`;
}

/**
 * Decide whether a league team row/series should be visually highlighted as
 * the user's active team. Shared by the three graph builders and the
 * leaderboard formatter so the rule lives in one place.
 *
 * A team is highlighted when EITHER:
 *   - its same-league `teamId` matches `highlight.teamId`
 *     (preserves the original same-league behavior), OR
 *   - its `{userName}_{teamNo}` matches `highlight.fantasyId`
 *     (rename-proof cross-league match).
 *
 * Empty/missing fields never match anything.
 *
 * @param {Object|null|undefined} team   - one team entry from the league blob
 * @param {string|null|undefined} leagueCode - the league the chart/table belongs to
 * @param {Object|null|undefined} highlight - { teamId?: string, fantasyId?: string }
 * @returns {boolean}
 */
function isHighlightedTeam(team, leagueCode, highlight) {
  if (!team || !highlight) {
    return false;
  }

  if (highlight.teamId && leagueCode) {
    const candidate = buildTeamId(
      leagueCode,
      team.teamName || team.userName || 'team',
    );
    if (candidate === highlight.teamId) {
      return true;
    }
  }

  if (highlight.fantasyId) {
    const teamFantasyId = buildFantasyId(team);
    if (teamFantasyId && teamFantasyId === highlight.fantasyId) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve the user's active `selectedTeam` into the cross-league
 * identification tuple consumers need.
 *
 * Returns:
 *   - `null` when there is no selected team or the selected team is a
 *     screenshot team (`T1`/`T2`/`T3`) — there is no F1 Fantasy account
 *     anchor for cross-league matching in that case.
 *   - `{ teamId, fantasyId }` for league teams. `fantasyId` is `null` when
 *     the league blob hasn't been rescraped yet to include `teamNo` —
 *     callers will still cross-check via `teamId` (same-league behavior).
 *
 * @param {number|string} chatId
 * @returns {Promise<{teamId: string, fantasyId: string|null}|null>}
 */
async function resolveActiveTeamFantasyId(chatId) {
  const selectedTeamId = getSelectedTeam(chatId);
  if (!selectedTeamId) {
    return null;
  }

  const leagueCode = extractLeagueCode(selectedTeamId);
  if (!leagueCode) {
    // Screenshot team (T1/T2/T3) — nothing to anchor cross-league on.
    return null;
  }

  let leagueData = null;
  try {
    leagueData = await loadLeagueTeamsData(leagueCode);
  } catch (err) {
    console.error(
      `Failed to load league teams-data for active-team resolution (${leagueCode}):`,
      err,
    );
  }

  if (!leagueData || !Array.isArray(leagueData.teams)) {
    return { teamId: selectedTeamId, fantasyId: null };
  }

  const match = leagueData.teams.find((team) => {
    const candidateTeamId = buildTeamId(
      leagueCode,
      team.teamName || team.userName || 'team',
    );

    return candidateTeamId === selectedTeamId;
  });

  if (!match) {
    return { teamId: selectedTeamId, fantasyId: null };
  }

  return {
    teamId: selectedTeamId,
    fantasyId: buildFantasyId(match),
  };
}

module.exports = {
  buildFantasyId,
  isHighlightedTeam,
  resolveActiveTeamFantasyId,
};
