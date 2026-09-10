const { calculateChangesToTeam } = require('../bestTeamsCalculator');

function buildBestTeamChanges({ calculationData, target, chip, ppm, remainingRaceCount }) {
  const changes = calculateChangesToTeam(calculationData, target, chip, ppm, remainingRaceCount);
  if (chip === 'LIMITLESS' && target.transfers_needed > calculationData.CurrentTeam.freeTransfers) {
    changes.chipToActivate = chip;
  }
  const roster = (keys, entries) => keys.map((id) => ({
    ...entries[id], id, code: entries[id]?.DR || entries[id]?.CN || id,
    // A code shared by multiple stored identities cannot identify a portrait.
    ambiguousCode: Object.values(entries).filter((entry) =>
      (entry.DR || entry.CN) === (entries[id]?.DR || entries[id]?.CN || id)).length > 1,
  }));
  const identity = (id) => id ? roster([id], calculationData.Drivers)[0] : null;

  return {
    ...changes,
    noChanges: !changes.driversToAdd.length && !changes.driversToRemove.length &&
      !changes.constructorsToAdd.length && !changes.constructorsToRemove.length &&
      !changes.newBoost && !changes.extraBoostDriver && !changes.chipToActivate,
    outgoingDrivers: roster(changes.driverKeysToRemove || changes.driversToRemove, calculationData.Drivers),
    incomingDrivers: roster(changes.driverKeysToAdd || changes.driversToAdd, calculationData.Drivers),
    outgoingConstructors: roster(changes.constructorsToRemove, calculationData.Constructors),
    incomingConstructors: roster(changes.constructorsToAdd, calculationData.Constructors),
    captainPlayer: identity(target.boost_driver_id || target.boost_driver),
    extraBoostPlayer: identity(target.extra_boost_driver_id || target.extra_boost_driver),
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
