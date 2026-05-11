/**
 * Sanitize a value so it can be safely embedded into an id segment / blob path.
 * Keeps the result short and readable.
 */
function sanitizeIdSegment(value) {
  const base = String(value || 'team')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = base.length > 0 ? base : 'team';

  return trimmed.slice(0, 40);
}

/**
 * Build the canonical league-team id from the F1 Fantasy account login and
 * team number (1/2/3). This id is **league-agnostic** — the same F1 Fantasy
 * team gets the same id in every league it appears in. Persisted into
 * `currentTeamCache`, `bestTeamsCache`, `selectedChipCache`,
 * `userCache[chatId].selectedTeam`, and the per-team blob path.
 *
 * @param {string|null|undefined} userName
 * @param {number|string|null|undefined} teamNo
 * @returns {string|null} null when either field is missing (caller must skip).
 */
function buildLeagueTeamId(userName, teamNo) {
  if (typeof userName !== 'string' || userName.length === 0) {
    return null;
  }
  if (teamNo === null || teamNo === undefined || teamNo === '') {
    return null;
  }

  return `${sanitizeIdSegment(userName)}_${teamNo}`;
}

// Back-compat alias — some call sites still use the old function name to
// sanitize team names for display/callback-payload purposes (not id
// construction). Safe to keep.
const sanitizeTeamName = sanitizeIdSegment;

module.exports = {
  sanitizeIdSegment,
  sanitizeTeamName,
  buildLeagueTeamId,
};

