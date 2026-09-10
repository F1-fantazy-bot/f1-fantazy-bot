const { buildBestTeamChanges } = require('./bestTeamChangesCore');
const Drivers = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => [id, { DR: id === 'f' ? 'a' : id, price: 10, expectedPoints: 10, expectedPriceChange: 0.1 }]));
const Constructors = Object.fromEntries(['X', 'Y', 'Z'].map((id) => [id, { CN: id, price: 10, expectedPoints: 10, expectedPriceChange: 0.1 }]));
const calculationData = { Drivers, Constructors, CurrentTeam: { drivers: ['a', 'b', 'c', 'd', 'e'], constructors: ['X', 'Y'], boost: 'a', freeTransfers: 1, costCapRemaining: 0 } };
const target = { driver_ids: ['a', 'b', 'c', 'd', 'e'], drivers: ['a', 'b', 'c', 'd', 'e'], constructors: ['X', 'Y'], boost_driver_id: 'a', boost_driver: 'a', transfers_needed: 0, penalty: 0, total_price: 70, projected_points: 80, expected_price_change: 0.7 };
const build = (overrides = {}, chip) => buildBestTeamChanges({ calculationData, target: { ...target, ...overrides }, chip, ppm: 2, remainingRaceCount: 10 });
test('unchanged roster and assignments need no changes', () => expect(build().noChanges).toBe(true));
test('captain-only changes are instructions despite zero transfers', () => {
  expect(build({ boost_driver: 'b', boost_driver_id: 'b' })).toMatchObject({ noChanges: false, newBoost: 'b', transfersNeeded: 0 });
});
test('duplicate codes retain canonical transfer identities and final projections', () => {
  const result = build({ driver_ids: ['f', 'b', 'c', 'd', 'e'], transfers_needed: 1 });
  expect(result).toMatchObject({ driverKeysToAdd: ['f'], driverKeysToRemove: ['a'], driversToAdd: ['a'], driversToRemove: ['a'], noChanges: false });
  expect(result.drivers[0]).toMatchObject({ id: 'f', code: 'a', expectedPoints: 10 });
});
test('constructor transfers, penalty and budget metrics are retained', () => {
  const result = build({ constructors: ['X', 'Z'], transfers_needed: 2, penalty: 10, projected_points: 90, budget_adjusted_points: 104 });
  expect(result).toMatchObject({ constructorsToRemove: ['Y'], constructorsToAdd: ['Z'], penalty: 10, projectedPoints: 90, deltaPoints: 10, targetBudgetAdjustedPoints: 104 });
});
test.each([
  ['EXTRA_BOOST', { extra_boost_driver: 'b', extra_boost_driver_id: 'b' }],
  ['WILDCARD', { transfers_needed: 2 }],
  ['LIMITLESS', { total_price: 100 }],
])('%s is included in the transfer instructions', (chip, overrides) => {
  expect(build(overrides, chip)).toMatchObject({ noChanges: false, chipToActivate: chip });
});

test('structured transfers and assignments retain canonical IDs despite duplicate codes', () => {
  const result = build({ driver_ids: ['f', 'b', 'c', 'd', 'e'], boost_driver_id: 'f', transfers_needed: 1 });
  expect(result.outgoingDrivers[0]).toMatchObject({ id: 'a', code: 'a', ambiguousCode: true });
  expect(result.incomingDrivers[0]).toMatchObject({ id: 'f', code: 'a', ambiguousCode: true });
  expect(result.captainPlayer).toMatchObject({ id: 'f', code: 'a' });
  expect(result.extraBoostPlayer).toBeNull();
});
