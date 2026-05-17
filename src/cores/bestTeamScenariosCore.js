// Pure best-team-scenarios core — computes the 4×4 matrix of top best
// teams across {0, 1.3, 1.65, 2.0} ppm weights × 4 chip choices (no chip,
// Limitless, Extra Boost, Wildcard). Mirrors the Telegram
// `/best_team_scenarios` command logic so the agent's
// `get_best_team_scenarios` tool returns the same structured data.

const { calculateBestTeams } = require('../bestTeamsCalculator');
const {
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  remainingRaceCountCache,
  getDriversForChat,
  getConstructorsForChat,
  getSelectedTeam,
  getUserTeamIds,
} = require('../cache');
const {
  EXTRA_BOOST_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
} = require('../constants');

const PPM_SCENARIOS = [
  { ppm: 0, label: 'Pure Points' },
  { ppm: 1.3, label: 'Points Lean' },
  { ppm: 1.65, label: 'Points Plus Budget' },
  { ppm: 2, label: 'Balanced Budget Value' },
];

// Chip recommendation thresholds — mirror the Telegram bot exactly
// (see `getChipRecommendationDot` in
// src/commandsHandler/bestTeamScenariosHandler.js). The "recommendation"
// is computed against the no-chip baseline of THIS ppm row.
const CHIP_RECOMMENDATION_THRESHOLDS = {
  [WILDCARD_CHIP]: { green: 30, yellow: 20 },
  [LIMITLESS_CHIP]: { green: 120, yellow: 100 },
  [EXTRA_BOOST_CHIP]: { green: 70, yellow: 50 },
};

function recommendationLevel(chipKey, diff) {
  if (!chipKey || !Number.isFinite(diff)) {
    return null;
  }
  const thresholds = CHIP_RECOMMENDATION_THRESHOLDS[chipKey];

  if (!thresholds) {
    return null;
  }
  if (diff >= thresholds.green) {
    return 'green';
  }
  if (diff >= thresholds.yellow) {
    return 'yellow';
  }

  return null;
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
    const match = teamIds.find((id) => {
      const team = currentTeamCache[chatId]?.[id];

      return (
        id === requestedTeamName ||
        team?.teamName === requestedTeamName ||
        (team?.teamName || '').toLowerCase() ===
          String(requestedTeamName).toLowerCase()
      );
    });

    if (match) {
      return { status: 'ok', teamId: match };
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

function computeBestTeamScenarios({ chatId, teamId, teamName }) {
  const pick = pickTeamId({
    chatId,
    requestedTeamId: teamId,
    requestedTeamName: teamName,
  });

  if (pick.status !== 'ok') {
    return pick;
  }
  const resolvedTeamId = pick.teamId;

  const drivers = getDriversForChat(chatId);
  const constructors = getConstructorsForChat(chatId);
  const currentTeam = currentTeamCache[chatId]?.[resolvedTeamId];

  if (!drivers || !constructors || !currentTeam) {
    return { status: 'missing_cache', teamId: resolvedTeamId };
  }

  const cachedJsonData = {
    Drivers: drivers,
    Constructors: constructors,
    CurrentTeam: currentTeam,
  };
  const selectedChip = selectedChipCache[chatId]?.[resolvedTeamId] || null;
  const remainingRaceCount = remainingRaceCountCache[sharedKey];
  const safeRemainingRaceCount = Number.isFinite(remainingRaceCount)
    ? remainingRaceCount
    : 0;

  // Mirror the Telegram /best_team_scenarios chip set: the user's current
  // chip occupies the first slot (under a "Without Chip" label so the
  // recommendation deltas are sensible against THAT baseline).
  const chipScenarios = [
    { chipKey: selectedChip, chipLabel: 'Without Chip' },
    { chipKey: LIMITLESS_CHIP, chipLabel: 'Limitless' },
    { chipKey: EXTRA_BOOST_CHIP, chipLabel: 'Extra Boost' },
    { chipKey: WILDCARD_CHIP, chipLabel: 'Wildcard' },
  ];

  const scenarios = PPM_SCENARIOS.map(({ ppm, label }) => {
    const results = chipScenarios.map(({ chipKey, chipLabel }) => {
      const [topTeam] = calculateBestTeams(
        cachedJsonData,
        chipKey,
        ppm,
        safeRemainingRaceCount,
      );

      if (!topTeam) {
        return {
          chipKey,
          chipLabel,
          projectedPoints: null,
          expectedPriceChange: null,
          recommendation: null,
        };
      }

      return {
        chipKey,
        chipLabel,
        projectedPoints: Number(topTeam.projected_points?.toFixed?.(2) ?? 0),
        expectedPriceChange:
          typeof topTeam.expected_price_change === 'number'
            ? Number(topTeam.expected_price_change.toFixed(2))
            : null,
        // Will be overlaid with the recommendation after we know the
        // no-chip baseline for this ppm row.
        recommendation: null,
        _rawProjectedPoints: topTeam.projected_points,
      };
    });

    const baseline = results[0]?._rawProjectedPoints;
    results.forEach((row, idx) => {
      if (idx === 0) {
        delete row._rawProjectedPoints;

        return;
      }
      if (
        typeof baseline === 'number' &&
        typeof row._rawProjectedPoints === 'number'
      ) {
        row.recommendation = recommendationLevel(
          row.chipKey,
          row._rawProjectedPoints - baseline,
        );
      }
      delete row._rawProjectedPoints;
    });

    return { ppm, ppmLabel: label, results };
  });

  return {
    status: 'ok',
    teamId: resolvedTeamId,
    teamName: currentTeam.teamName || resolvedTeamId,
    chip: selectedChip,
    scenarios,
  };
}

module.exports = {
  computeBestTeamScenarios,
  PPM_SCENARIOS,
  CHIP_RECOMMENDATION_THRESHOLDS,
};
