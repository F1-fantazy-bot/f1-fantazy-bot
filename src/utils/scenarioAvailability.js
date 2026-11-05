const { getAvailableChips } = require('../cores/availableChipsCore');
const { identityKeyFromLeagueTeamId } = require('./teamId');
const { LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP } = require('../constants');

const CHIP_SCENARIOS = [
  { chipKey: null, chipLabel: 'Without Chip', catalogName: null },
  { chipKey: LIMITLESS_CHIP, chipLabel: 'Limitless', catalogName: 'Limitless' },
  { chipKey: EXTRA_BOOST_CHIP, chipLabel: 'Extra Boost', catalogName: 'Extra DRS Boost' },
  { chipKey: WILDCARD_CHIP, chipLabel: 'Wildcard', catalogName: 'Wildcard' },
];
const UNKNOWN_CHIP_USAGE_MESSAGE = 'Chip usage could not be verified; showing no-chip scenarios only.';

// Resolve once before optimization. Names and saved chip preferences are never
// evidence of identity or availability; partial reads cannot prove non-use.
async function resolveScenarioAvailability({ chatId, teamId }) {
  const key = identityKeyFromLeagueTeamId(teamId);
  let team;
  let known = false;
  if (key) {
    try {
      const result = await getAvailableChips({ chatId, scope: 'team', teamId });
      if (result?.status === 'ok' && result.teams?.length === 1 &&
          identityKeyFromLeagueTeamId(result.teams[0].teamId) === key) {
        team = result.teams[0];
        known = !result.partial && team.chipUsageStatus === 'known' && Array.isArray(team.availableChips);
      }
    } catch {
      // Chip reads must not prevent an otherwise valid no-chip calculation.
    }
  }

  return {
    chipAvailability: { status: known ? 'known' : 'unknown', updatedAt: team?.updatedAt ?? null },
    chipScenarios: CHIP_SCENARIOS
      .filter(({ chipKey, catalogName }) => chipKey === null || (known && team.availableChips.includes(catalogName)))
      .map(({ chipKey, chipLabel }) => ({ chipKey, chipLabel })),
  };
}

module.exports = { resolveScenarioAvailability, UNKNOWN_CHIP_USAGE_MESSAGE };
