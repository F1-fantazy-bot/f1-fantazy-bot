/**
 * Sanitize a value so it can be safely embedded into an id segment / blob path.
 * Keeps the result short and readable. Generalized from the previous
 * `sanitizeTeamName` — works for any string (team names, user names, etc.).
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

/**
 * Legacy league-team id builder, kept ONLY so the cacheInitializer
 * migration path can detect and rewrite old blobs/cache entries.
 * Removed in the follow-up PR after production has fully migrated.
 *
 * Old format: `{leagueCode}_{sanitizeIdSegment(teamName)}` — encodes the
 * league, so the same F1 Fantasy team in two leagues had two distinct ids.
 *
 * @deprecated Use `buildLeagueTeamId(userName, teamNo)` for new code.
 */
function buildLegacyLeagueTeamId(leagueCode, teamName) {
  return `${leagueCode}_${sanitizeIdSegment(teamName)}`;
}

// Back-compat alias — some call sites still use the old function name to
// sanitize team names for display/callback-payload purposes (not id
// construction). Safe to keep.
const sanitizeTeamName = sanitizeIdSegment;

module.exports = {
  sanitizeIdSegment,
  sanitizeTeamName,
  buildLeagueTeamId,
  buildLegacyLeagueTeamId,
};

