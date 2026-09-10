const { calculateChangesToTeam } = require('../bestTeamsCalculator');

function buildBestTeamChanges({ calculationData, target, chip, ppm, remainingRaceCount }) {
  const changes = calculateChangesToTeam(calculationData, target, chip, ppm, remainingRaceCount);
  if (chip === 'LIMITLESS' && target.transfers_needed > calculationData.CurrentTeam.freeTransfers) {
    changes.chipToActivate = chip;
  }
  const roster = (keys, entries) => keys.map((id) => ({ id, code: entries[id]?.DR || id, ...entries[id] }));

  return {
    ...changes,
    noChanges: !changes.driversToAdd.length && !changes.driversToRemove.length &&
      !changes.constructorsToAdd.length && !changes.constructorsToRemove.length &&
      !changes.newBoost && !changes.extraBoostDriver && !changes.chipToActivate,
    captain: target.boost_driver,
    extraBoost: target.extra_boost_driver || null,
    transfersNeeded: target.transfers_needed,
    penalty: target.penalty,
    projectedPoints: target.projected_points,
    expectedPriceChange: target.expected_price_change,
    totalPrice: target.total_price,
    budgetChangePointsPerMillion: ppm,
    drivers: roster(target.driver_ids || target.drivers, calculationData.Drivers),
    constructors: roster(target.constructors, calculationData.Constructors),
  };
}
module.exports = { buildBestTeamChanges };
