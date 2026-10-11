jest.mock('../azureStorageService', () => ({ getLeagueTeamsData: jest.fn(), getPricesData: jest.fn() }));
jest.mock('../leagueRegistryService', () => ({ listUserLeagues: jest.fn() }));
const storage = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const cache = require('../cache');
const { mapLeagueTeamToBotTeam } = require('../utils/leagueTeamHelpers');
const { recommendationIssue, publicFreeTransfers } = require('../utils/teamDataStatus');
const { refreshWeeklyTeamData, resetWeeklyRefreshForTests, resolveWeeklyTeam } = require('./weeklyTeamDataService');
const { computeBestTeams } = require('../cores/bestTeamsCore');
const { computeBestTeamScenarios } = require('../cores/bestTeamScenariosCore');
const { compareLeagueChanges } = require('../cores/leagueChangesCore');
const { buildSimulationStatus } = require('../cores/simulationStatusCore');

const teamId = 'Owner_1_aaaaaaaaaaaa';
const names = ['M. Verstappen', 'L. Norris', 'C. Leclerc', 'G. Russell', 'L. Hamilton'];
function team(overrides = {}) {
  return { accountId: 'aaaaaaaaaaaa', userName: 'Owner', teamNo: 1, teamName: 'Baseline',
    drivers: names.map((name, i) => ({ id: String(i + 1), name, price: 10, isCaptain: i === 0 })),
    constructors: [{ id: '10', name: 'McLaren', price: 10 }, { id: '11', name: 'Ferrari', price: 10 }],
    budget: 80, budgetStatus: 'calculated-race-start', budgetSourceMatchdayId: 17,
    transfersRemaining: 2, transfersStatus: 'calculated-race-start', transfersSourceMatchdayId: 17,
    teamStateStatus: 'reconstructed-race-start', teamStateMatchdayId: 16, ...overrides };
}
function prices(matchdayId = 18) {
  return { matchdayId, drivers: team().drivers.map((entry, i) => ({ ...entry, code: ['VER', 'NOR', 'LEC', 'RUS', 'HAM'][i], isActive: true })),
    constructors: team().constructors };
}
beforeEach(() => {
  jest.resetAllMocks(); resetWeeklyRefreshForTests();
  for (const store of [cache.currentTeamCache, cache.bestTeamsCache, cache.userCache, cache.driversCache, cache.constructorsCache]) {
    for (const key of Object.keys(store)) {delete store[key];}
  }
  cache.clearPrices();
  listUserLeagues.mockResolvedValue([{ leagueCode: 'L1' }]);
  storage.getLeagueTeamsData.mockResolvedValue({ matchdayId: 18, teams: [team()] });
  storage.getPricesData.mockResolvedValue(prices());
});

test('preserves target race, older restored source, cash, and starting allowance', () => {
  const result = mapLeagueTeamToBotTeam(team(), { matchdayId: 18 });
  expect(result).toMatchObject({ matchdayId: 18, teamStateMatchdayId: 16, costCapRemaining: 10,
    freeTransfers: 2, budgetStatus: 'calculated-race-start', transfersStatus: 'calculated-race-start' });
  expect(recommendationIssue(result, 18)).toBeNull();
  expect(recommendationIssue(result, 17)).toBe('race_mismatch');
  expect(recommendationIssue(result, null)).toBe('race_mismatch');
});

test('unknown values stay null and stop optimization; genuine zero remains known', () => {
  const unknown = mapLeagueTeamToBotTeam(team({ budget: null, budgetStatus: 'unknown', transfersRemaining: null, transfersStatus: 'unknown' }), { matchdayId: 18 });
  expect(unknown.costCapRemaining).toBeNull(); expect(unknown.freeTransfers).toBeNull();
  expect(recommendationIssue(unknown, 18)).toBe('missing_team_budget');
  const zero = mapLeagueTeamToBotTeam(team({ budget: 70, transfersRemaining: 0 }), { matchdayId: 18 });
  expect(zero.costCapRemaining).toBe(0); expect(zero.freeTransfers).toBe(0);
  expect(recommendationIssue(zero, 18)).toBeNull();
  expect(recommendationIssue({ ...zero, teamStateStatus: 'historical' }, 18)).toBe('missing_team_baseline');
  expect(recommendationIssue({ ...zero, freeTransfers: null, transfersStatus: 'unknown' }, 18)).toBe('missing_team_transfers');
});

test('unlimited transfers do not grant unlimited budget and never display as seven', () => {
  const unlimited = mapLeagueTeamToBotTeam(team({ transfersRemaining: null, transfersStatus: 'unlimited' }), { matchdayId: 18 });
  expect(unlimited.freeTransfers).toBe(7); expect(publicFreeTransfers(unlimited)).toBeNull();
  expect(unlimited.costCapRemaining).toBe(10);
  expect(recommendationIssue(unlimited, 18)).toBeNull();
});

test('refreshes a warm canonical team without writing or changing preferences, and deduplicates reads', async () => {
  cache.currentTeamCache[42] = { [teamId]: { accountId: 'aaaaaaaaaaaa', teamNo: 1, matchdayId: 17 } };
  cache.userCache[42] = { selectedTeam: teamId, selectedChipByTeam: { [teamId]: 'WILDCARD' } };
  cache.bestTeamsCache[42] = { [teamId]: { stale: true } };
  await Promise.all([refreshWeeklyTeamData(42), refreshWeeklyTeamData(42)]);
  expect(cache.currentTeamCache[42][teamId]).toMatchObject({ matchdayId: 18, costCapRemaining: 10 });
  expect(cache.pricesCache.metadata.matchdayId).toBe(18);
  expect(cache.bestTeamsCache[42]?.[teamId]).toBeUndefined();
  expect(cache.userCache[42].selectedChipByTeam[teamId]).toBe('WILDCARD');
  await refreshWeeklyTeamData(42);
  expect(storage.getLeagueTeamsData).toHaveBeenCalledTimes(1);
});

test('a failed refresh disables recommendations instead of retaining a ready old snapshot', async () => {
  cache.currentTeamCache[42] = { [teamId]: mapLeagueTeamToBotTeam(team(), { matchdayId: 18 }) };
  storage.getPricesData.mockRejectedValue(new Error('offline'));
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { await refreshWeeklyTeamData(42); } finally { error.mockRestore(); }
  expect(recommendationIssue(cache.currentTeamCache[42][teamId], 18)).toBe('missing_team_baseline');
});

test('identity uses account + team number even when the owner name changes', () => {
  const fresh = resolveWeeklyTeam(teamId, {}, [{ leagueCode: 'L1', data: { matchdayId: 18, teams: [team({ userName: 'Renamed' })] } }]);
  expect(fresh.userName).toBe('Renamed'); expect(fresh.matchdayId).toBe(18);
});

test('both recommendation cores accept a real starting baseline and block unknown budget', async () => {
  const mapped = mapLeagueTeamToBotTeam(team(), { matchdayId: 18 });
  cache.currentTeamCache[42] = { [teamId]: mapped };
  cache.driversCache[cache.sharedKey] = Object.fromEntries(prices().drivers.map((entry) => [entry.code, { DR: entry.code, price: 10, expectedPoints: 20, expectedPriceChange: 0 }]));
  cache.constructorsCache[cache.sharedKey] = { MCL: { CN: 'MCL', price: 10, expectedPoints: 20, expectedPriceChange: 0 }, FER: { CN: 'FER', price: 10, expectedPoints: 20, expectedPriceChange: 0 } };
  await refreshWeeklyTeamData(42);
  const result = await computeBestTeams({ chatId: 42, teamId });
  expect(result.status).toBe('ok'); expect(result.bestTeams.length).toBeGreaterThan(0);
  expect(result.dataStatus.teamStateMatchdayId).toBe(16);
  expect(computeBestTeamScenarios({ chatId: 42, teamId }).status).toBe('ok');
  cache.currentTeamCache[42][teamId].costCapRemaining = null;
  cache.currentTeamCache[42][teamId].budgetStatus = 'unknown';
  expect((await computeBestTeams({ chatId: 42, teamId })).status).toBe('missing_team_budget');
  expect(computeBestTeamScenarios({ chatId: 42, teamId }).status).toBe('missing_team_budget');
});

test('league changes accept restored baselines but exclude unavailable teams from unchanged counts', () => {
  const baseline = team();
  const locked = { ...baseline, teamStateStatus: 'current', matchdayId: 18 };
  const good = compareLeagueChanges({ latest: { matchdayId: 18, teams: [locked] }, planning: { matchdayId: 18, teams: [baseline] } });
  expect(good.planningKind).toBe('race-start'); expect(good.unchangedTeams).toHaveLength(1);
  const bad = compareLeagueChanges({ latest: { matchdayId: 18, teams: [locked] }, planning: { matchdayId: 18, teams: [{ ...baseline, teamStateStatus: 'historical' }] } });
  expect(bad.unchangedTeams).toHaveLength(0); expect(bad.changedTeams).toHaveLength(0); expect(bad.unavailableTeams).toHaveLength(1);
});

test('fresh race prices do not make an old simulation fresh', () => {
  expect(buildSimulationStatus({ simulationInfo: { name: 'Singapore GP projection' }, pricesMetadata: { matchdayId: 18 },
    nextRaceInfo: { matchdayId: 18, raceName: 'United States GP', circuitName: 'Austin' } }).freshness.status).toBe('stale');
});
