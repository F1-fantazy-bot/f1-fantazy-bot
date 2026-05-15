// Pure best-teams core — no `bot`, no `t()`, no `sendMessage`. Both the
// Telegram adapter (`commandsHandler/bestTeamsHandler.js`) and the web-chat
// agent tool (`agent/tools.js`) call into this.
//
// Returns a status-tagged result the caller can map onto its preferred
// surface (Telegram message vs. structured JSON for the LLM).

const { calculateBestTeams } = require('../bestTeamsCalculator');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  remainingRaceCountCache,
  getSelectedTeam,
  getUserTeamIds,
  getBestTeamBudgetChangePointsPerMillion,
} = require('../cache');
const { NAME_TO_CODE_MAPPING } = require('../constants');

// Normalize a single user-supplied driver / constructor token to its canonical
// 3-letter code. Accepts already-uppercase codes (`'VER'`) and lowercased
// human-friendly names (`'m. verstappen'`, `'mclaren'`). Returns null when
// the input cannot be resolved.
function normalizeCode(rawCode) {
  if (typeof rawCode !== 'string') {return null;}
  const trimmed = rawCode.trim();
  if (!trimmed) {return null;}

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) {
    // Already a canonical 3-letter code. We trust it without verifying it
    // exists in the current drivers/constructors data — the calculator
    // simply yields zero matching teams if it doesn't.
    return upper;
  }

  const mapped = NAME_TO_CODE_MAPPING[trimmed.toLowerCase()];

  return mapped || null;
}

function resolveCodes(rawList) {
  const requested = Array.isArray(rawList) ? rawList.filter(Boolean) : [];
  const resolved = [];
  const unknown = [];
  for (const raw of requested) {
    const code = normalizeCode(raw);
    if (code) {
      resolved.push(code);
    } else {
      unknown.push(String(raw));
    }
  }

  return { requested, resolved, unknown };
}

function resolveAllFilters({
  mustIncludeDrivers,
  mustExcludeDrivers,
  mustIncludeConstructors,
  mustExcludeConstructors,
}) {
  return {
    mustIncludeDrivers: resolveCodes(mustIncludeDrivers),
    mustExcludeDrivers: resolveCodes(mustExcludeDrivers),
    mustIncludeConstructors: resolveCodes(mustIncludeConstructors),
    mustExcludeConstructors: resolveCodes(mustExcludeConstructors),
  };
}

function pickTeamId({ chatId, requestedTeamId, requestedTeamName }) {
  const teamIds = getUserTeamIds(chatId);
  if (teamIds.length === 0) {
    return { status: 'no_teams' };
  }

  if (requestedTeamId) {
    if (!teamIds.includes(requestedTeamId)) {
      return { status: 'unknown_team', teamId: requestedTeamId, teamIds };
    }

    return { status: 'ok', teamId: requestedTeamId };
  }

  if (requestedTeamName) {
    // Exact match against the cached `teamName` of each team. We do NOT
    // fuzzy-match — that would re-introduce all the ambiguity that
    // driving via `list_user_teams` first is supposed to avoid.
    const matches = teamIds.filter(
      (id) => currentTeamCache[chatId]?.[id]?.teamName === requestedTeamName,
    );
    if (matches.length === 1) {
      return { status: 'ok', teamId: matches[0] };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous_team', teamIds: matches };
    }

    return { status: 'unknown_team', teamName: requestedTeamName, teamIds };
  }

  if (teamIds.length === 1) {
    return { status: 'ok', teamId: teamIds[0] };
  }

  const selected = getSelectedTeam(chatId);
  if (selected && teamIds.includes(selected)) {
    return { status: 'ok', teamId: selected };
  }

  return { status: 'ambiguous_team', teamIds };
}

function hasAnyFilter(filters) {
  return (
    filters.mustIncludeDrivers.resolved.length > 0 ||
    filters.mustExcludeDrivers.resolved.length > 0 ||
    filters.mustIncludeConstructors.resolved.length > 0 ||
    filters.mustExcludeConstructors.resolved.length > 0
  );
}

function buildCalculatorOptions({ filters, rankBy, resultCount }) {
  // Only emit an options object when the caller actually requested something
  // beyond the legacy 4-arg behaviour. This keeps the Telegram handler
  // path (no filters, no rankBy) calling `calculateBestTeams` with the
  // historical 4 positional args, which the existing handler tests rely
  // on via `toHaveBeenCalledWith(data, chip, ppm, rrc)`.
  if (!hasAnyFilter(filters) && rankBy === null && resultCount === undefined) {
    return null;
  }

  return {
    mustIncludeDrivers: filters.mustIncludeDrivers.resolved,
    mustExcludeDrivers: filters.mustExcludeDrivers.resolved,
    mustIncludeConstructors: filters.mustIncludeConstructors.resolved,
    mustExcludeConstructors: filters.mustExcludeConstructors.resolved,
    rankBy,
    ...(Number.isFinite(resultCount) ? { resultCount } : {}),
  };
}

// eslint-disable-next-line max-statements
async function computeBestTeams({
  chatId,
  teamId: requestedTeamId,
  teamName: requestedTeamName,
  rankBy = null,
  resultCount,
  mustIncludeDrivers,
  mustExcludeDrivers,
  mustIncludeConstructors,
  mustExcludeConstructors,
}) {
  const pick = pickTeamId({ chatId, requestedTeamId, requestedTeamName });
  if (pick.status !== 'ok') {
    return pick;
  }
  const { teamId } = pick;

  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId]?.[teamId];

  if (!drivers || !constructors || !currentTeam) {
    return { status: 'missing_cache', teamId };
  }

  const budgetChangePointsPerMillion = getBestTeamBudgetChangePointsPerMillion(
    chatId,
    teamId,
  );
  const remainingRaceCount = remainingRaceCountCache[sharedKey];
  if (
    budgetChangePointsPerMillion > 0 &&
    !Number.isFinite(remainingRaceCount)
  ) {
    return { status: 'missing_remaining_race_count', teamId };
  }

  const filters = resolveAllFilters({
    mustIncludeDrivers,
    mustExcludeDrivers,
    mustIncludeConstructors,
    mustExcludeConstructors,
  });
  const anyUnknown =
    filters.mustIncludeDrivers.unknown.length > 0 ||
    filters.mustExcludeDrivers.unknown.length > 0 ||
    filters.mustIncludeConstructors.unknown.length > 0 ||
    filters.mustExcludeConstructors.unknown.length > 0;
  if (anyUnknown) {
    return { status: 'unknown_filter', teamId, filters };
  }

  const chip = selectedChipCache[chatId]?.[teamId];
  const cachedJsonData = {
    Drivers: drivers,
    Constructors: constructors,
    CurrentTeam: currentTeam,
  };
  const calculatorOptions = buildCalculatorOptions({
    filters,
    rankBy,
    resultCount,
  });

  const bestTeams = calculatorOptions
    ? calculateBestTeams(
        cachedJsonData,
        chip,
        budgetChangePointsPerMillion,
        Number.isFinite(remainingRaceCount) ? remainingRaceCount : 0,
        calculatorOptions,
      )
    : calculateBestTeams(
        cachedJsonData,
        chip,
        budgetChangePointsPerMillion,
        Number.isFinite(remainingRaceCount) ? remainingRaceCount : 0,
      );

  return {
    status: 'ok',
    teamId,
    teamName: currentTeam.teamName || teamId,
    currentTeam,
    bestTeams,
    chip,
    rankBy,
    budgetChangePointsPerMillion,
    filters,
  };
}

module.exports = {
  computeBestTeams,
  // exported for unit tests / advanced callers
  normalizeCode,
  resolveCodes,
};

