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
 * F1 Fantasy user_guid. Missing account IDs cannot produce canonical IDs.
 */
function buildLeagueTeamId(userName, teamNo, accountId) {
  const legacyId = buildLegacyLeagueTeamId(userName, teamNo);
  if (!legacyId) {
    return null;
  }

  if (typeof accountId !== 'string' || !/^[a-z0-9]{1,40}$/i.test(accountId)) {return null;}

  return `${legacyId}_${accountId.toLowerCase()}`;
}

function buildLeagueTeamIdentityKey(accountId, teamNo) {
  if (typeof accountId !== 'string' || !/^[a-z0-9]{1,40}$/i.test(accountId) ||
    teamNo === null || teamNo === undefined || teamNo === '') {return null;}

  return `${accountId.toLowerCase()}:${teamNo}`;
}

function identityKeyFromLeagueTeamId(teamId) {
  const match = typeof teamId === 'string'
    ? teamId.match(/_(\d+)_([a-z0-9]{1,40})$/i) : null;

  return match ? buildLeagueTeamIdentityKey(match[2], Number(match[1])) : null;
}

function sameLeagueTeamIds(left, right) {
  const leftKey = identityKeyFromLeagueTeamId(left);
  const rightKey = identityKeyFromLeagueTeamId(right);

  return leftKey && rightKey ? leftKey === rightKey : Boolean(left && left === right);
}

/**
 * Compact stable selector for Telegram callback_data. Canonical team ids can
 * be too long once accountId is appended, so callbacks use accountId+teamNo
 * and resolve back to the canonical id from the fresh league roster.
 */
function buildLeagueTeamCallbackKey(userName, teamNo, accountId) {
  const key = buildLeagueTeamIdentityKey(accountId, teamNo);

  return key ? `${teamNo}_${accountId.toLowerCase()}` : null;
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
  buildLeagueTeamIdentityKey,
  identityKeyFromLeagueTeamId,
  sameLeagueTeamIds,
  buildLeagueTeamCallbackKey,
};
