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
 * Legacy league-team id used before account-aware identity was introduced.
 * Kept only for backwards-compatible reads and startup migration.
 */
function buildLegacyLeagueTeamId(userName, teamNo) {
  if (typeof userName !== 'string' || userName.length === 0) {
    return null;
  }
  if (teamNo === null || teamNo === undefined || teamNo === '') {
    return null;
  }

  return `${sanitizeIdSegment(userName)}_${teamNo}`;
}

/**
 * Build the canonical league-team id.
 *
 * New data uses {sanitize(userName)}_{teamNo}_{accountId}. accountId is the
 * stable opaque account discriminator emitted by f1-fantasy-api-data from the
 * F1 Fantasy user_guid. Older blobs may not contain accountId yet; in that
 * case return the legacy id so they remain readable until the next scrape.
 */
function buildLeagueTeamId(userName, teamNo, accountId) {
  const legacyId = buildLegacyLeagueTeamId(userName, teamNo);
  if (!legacyId) {
    return null;
  }

  if (accountId === null || accountId === undefined || accountId === '') {
    return legacyId;
  }

  return `${legacyId}_${sanitizeIdSegment(accountId)}`;
}

/**
 * Compact stable selector for Telegram callback_data. Canonical team ids can
 * be too long once accountId is appended, so callbacks use accountId+teamNo
 * and resolve back to the canonical id from the fresh league roster.
 */
function buildLeagueTeamCallbackKey(userName, teamNo, accountId) {
  if (accountId !== null && accountId !== undefined && accountId !== '') {
    if (teamNo === null || teamNo === undefined || teamNo === '') {
      return null;
    }

    return `${teamNo}_${sanitizeIdSegment(accountId)}`;
  }

  return buildLegacyLeagueTeamId(userName, teamNo);
}

// Back-compat alias — some call sites still use the old function name to
// sanitize team names for display/callback-payload purposes (not id
// construction). Safe to keep.
const sanitizeTeamName = sanitizeIdSegment;

module.exports = {
  sanitizeIdSegment,
  sanitizeTeamName,
  buildLegacyLeagueTeamId,
  buildLeagueTeamId,
  buildLeagueTeamCallbackKey,
};
