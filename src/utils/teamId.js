/**
 * Sanitize a team name so it can be safely embedded into IDs/blob paths.
 * Keeps the result short and readable.
 */
function sanitizeTeamName(name) {
  const base = String(name || 'team')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = base.length > 0 ? base : 'team';

  return trimmed.slice(0, 40);
}

function buildTeamId(leagueCode, teamName) {
  return `${leagueCode}_${sanitizeTeamName(teamName)}`;
}

module.exports = {
  sanitizeTeamName,
  buildTeamId,
};
