const { EXCLUDED_GRAPH_TEAM_NAMES } = require('../constants');

/**
 * Normalize a team name for case-insensitive, whitespace-tolerant comparison.
 * Returns an empty string for non-string input so the caller can safely use
 * `Set.has(...)` / equality checks without an extra null guard.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeTeamName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const EXCLUDED_NAME_SET = new Set(
  (Array.isArray(EXCLUDED_GRAPH_TEAM_NAMES) ? EXCLUDED_GRAPH_TEAM_NAMES : [])
    .map(normalizeTeamName)
    .filter((name) => name.length > 0),
);

/**
 * True when the team's `teamName` matches one of the configured
 * `EXCLUDED_GRAPH_TEAM_NAMES` entries (comparison is case-insensitive and
 * trims surrounding whitespace). `userName` is intentionally NOT considered
 * — only the team name is used.
 *
 * @param {Object|null|undefined} team
 * @returns {boolean}
 */
function isExcludedFromGraphs(team) {
  if (!team || typeof team !== 'object') {
    return false;
  }
  if (EXCLUDED_NAME_SET.size === 0) {
    return false;
  }

  const teamName = normalizeTeamName(team.teamName);

  return teamName.length > 0 && EXCLUDED_NAME_SET.has(teamName);
}

/**
 * Filter out teams flagged by `isExcludedFromGraphs`. Returns a new array.
 * Non-array input is treated as empty (mirrors the defensive `Array.isArray`
 * guards already used in the graph builders).
 *
 * @param {Array<Object>|null|undefined} teams
 * @returns {Array<Object>}
 */
function filterExcludedGraphTeams(teams) {
  if (!Array.isArray(teams)) {
    return [];
  }

  return teams.filter((team) => !isExcludedFromGraphs(team));
}

module.exports = {
  isExcludedFromGraphs,
  filterExcludedGraphTeams,
};
