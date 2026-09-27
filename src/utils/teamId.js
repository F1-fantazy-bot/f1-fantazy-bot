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

const ACCOUNT_ID_SEGMENT_MAX_LENGTH = 16;

function hasTeamIdentityParts(userName, teamNo) {
  return (
    typeof userName === 'string' &&
    userName.length > 0 &&
    teamNo !== null &&
    teamNo !== undefined &&
    teamNo !== ''
  );
}

/**
 * Previous league-team id used before account-aware identity shipped.
 * Kept only for migration/backwards compatibility with blobs that have not
 * yet been refreshed by f1-fantasy-api-data.
 */
function buildLegacyLeagueTeamId(userName, teamNo) {
  if (!hasTeamIdentityParts(userName, teamNo)) {
    return null;
  }

  return `${sanitizeIdSegment(userName)}_${teamNo}`;
}

/**
 * Build the canonical league-team id:
 *   {sanitize(userName)}_{teamNo}_{accountId}
 *
 * accountId is the opaque account identifier written by f1-fantasy-api-data.
 * Different F1 accounts may legitimately share the same display userName and
 * team number, so accountId is required for collision-free identity.
 *
 * During the scraper rollout, old blobs may not carry accountId yet. In that
 * transition case we deliberately return the old two-part id so existing
 * teams continue working until a fresh blob enables migration.
 */
function buildLeagueTeamId(userName, teamNo, accountId) {
  const legacyId = buildLegacyLeagueTeamId(userName, teamNo);
  if (!legacyId) {
    return null;
  }

  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    return legacyId;
  }

  const accountSegment = sanitizeIdSegment(accountId)
    .slice(0, ACCOUNT_ID_SEGMENT_MAX_LENGTH);

  return `${legacyId}_${accountSegment}`;
}

// Back-compat alias — some call sites still use the old function name to
// sanitize team names for display/callback-payload purposes (not id
// construction). Safe to keep.
const sanitizeTeamName = sanitizeIdSegment;

module.exports = {
  ACCOUNT_ID_SEGMENT_MAX_LENGTH,
  sanitizeIdSegment,
  sanitizeTeamName,
  buildLegacyLeagueTeamId,
  buildLeagueTeamId,
};
