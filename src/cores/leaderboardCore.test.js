jest.mock('../raceScheduleService', () => ({ fetchCurrentSeasonRaces: jest.fn() }));
jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
}));

const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getLeaderboard, discoverLeaderboardRaces, buildLeaderboardStandings } = require('./leaderboardCore');
const cache = require('../cache');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');

function resetCache() {
  Object.keys(cache.userCache).forEach((k) => delete cache.userCache[k]);
}

describe('getLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCache();
  });

  test('returns status=invalid_input when leagueCode is missing', async () => {
    const result = await getLeaderboard({ chatId: 42, leagueCode: '' });
    expect(result).toEqual({ status: 'invalid_input', leagueCode: null });
    expect(listUserLeagues).not.toHaveBeenCalled();
  });

  test('returns status=not_followed when the user does not follow the league', async () => {
    listUserLeagues.mockResolvedValue([{ leagueCode: 'OTHER' }]);

    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    expect(result).toEqual({ status: 'not_followed', leagueCode: 'C7' });
    expect(getLeagueData).not.toHaveBeenCalled();
  });

  test('returns status=not_found when the blob is missing', async () => {
    listUserLeagues.mockResolvedValue([{ leagueCode: 'C7' }]);
    getLeagueData.mockResolvedValue(null);

    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    expect(result).toEqual({ status: 'not_found', leagueCode: 'C7' });
  });

  test('returns sorted standings with gapToLeader and selected highlight', async () => {
    cache.userCache['42'] = { selectedTeam: 'Kilzid_1_aaaaaaaaaaaa' };
    listUserLeagues.mockResolvedValue([{ leagueCode: 'C7' }]);
    getLeagueData.mockResolvedValue({
      leagueName: 'MSFT ILDC 2026 League',
      leagueId: 2976007,
      memberCount: 3,
      fetchedAt: '2026-05-17T00:00:00Z',
      teams: [
        { position: 3, teamName: 'Other2', userName: 'Other2', teamNo: 1, accountId: 'cccccccccccc', totalScore: 900 },
        { position: 1, teamName: 'Cooperon', userName: 'Cooperon', teamNo: 1, accountId: 'bbbbbbbbbbbb', totalScore: 1223 },
        { position: 2, teamName: 'Kilzid', userName: 'Kilzid', teamNo: 1, accountId: 'aaaaaaaaaaaa', totalScore: 1100 },
      ],
    });

    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    expect(result.status).toBe('ok');
    expect(result.leagueCode).toBe('C7');
    expect(result.leagueName).toBe('MSFT ILDC 2026 League');
    expect(result.memberCount).toBe(3);
    expect(result.fetchedAt).toBe('2026-05-17T00:00:00Z');
    expect(result.selectedTeamId).toBe('Kilzid_1_aaaaaaaaaaaa');

    const positions = result.standings.map((s) => s.position);
    expect(positions).toEqual([1, 2, 3]);

    const cooperon = result.standings[0];
    expect(cooperon).toMatchObject({
      teamName: 'Cooperon',
      teamId: 'Cooperon_1_bbbbbbbbbbbb',
      totalScore: 1223,
      gapToLeader: 0,
      isSelected: false,
    });

    const kilzid = result.standings[1];
    expect(kilzid).toMatchObject({
      teamName: 'Kilzid',
      teamId: 'Kilzid_1_aaaaaaaaaaaa',
      totalScore: 1100,
      gapToLeader: -123,
      isSelected: true,
    });
  });

  test('handles missing position / score gracefully', async () => {
    listUserLeagues.mockResolvedValue([{ leagueCode: 'C7' }]);
    getLeagueData.mockResolvedValue({
      leagueName: 'L',
      teams: [
        { teamName: 'Mystery', userName: 'M', teamNo: 1, accountId: 'aaaaaaaaaaaa' },
      ],
    });

    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    expect(result.status).toBe('ok');
    expect(result.standings[0]).toMatchObject({
      position: null,
      totalScore: null,
      gapToLeader: null,
      teamId: 'M_1_aaaaaaaaaaaa',
    });
  });
});


describe('race standings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCache();
    listUserLeagues.mockResolvedValue([{ leagueCode: 'C7' }]);
    fetchCurrentSeasonRaces.mockResolvedValue({ MRData: { RaceTable: { Races: [
      { round: '2', raceName: 'Australian Grand Prix' },
      { round: '10', raceName: 'Austrian Grand Prix' },
    ] } } });
    getLeagueData.mockResolvedValue({ leagueName: 'League', teams: [
      { position: 1, totalScore: 1000, userName: 'A', teamNo: 1, accountId: 'aaaaaaaaaaaa', raceScores: { matchday_2: -5, matchday_10: 0 } },
      { position: 2, totalScore: 900, userName: 'B', teamNo: 1, accountId: 'bbbbbbbbbbbb', raceScores: { matchday_2: 5, matchday_10: 20 } },
      { position: 3, totalScore: 800, userName: 'C', teamNo: 1, accountId: 'cccccccccccc', raceScores: { matchday_10: 20 } },
      { position: 4, totalScore: 700, userName: 'D', raceScores: { matchday_10: -5 } },
      { position: 5, totalScore: 600, userName: 'E', raceScores: { matchday_10: null } },
      { position: 6, totalScore: 500, userName: 'F', raceScores: { matchday_10: '40' } },
    ] });
  });
  test('discovers only finite numeric scores on valid rounds, newest first, with fallback names', () => {
    expect(discoverLeaderboardRaces([{ raceScores: {
      matchday_2: 0, matchday_10: -1, matchday_3: 1, matchday_1: null,
      matchday_4: '12', matchday_5: NaN, matchday_6: Infinity,
      matchday_0: 10, matchday_no: 10, bogus: 1,
    } }], { 10: 'Austrian GP' })).toEqual([
      { matchdayId: 10, raceName: 'Austrian GP' },
      { matchdayId: 3, raceName: 'R3' },
      { matchdayId: 2, raceName: 'R2' },
    ]);
  });
  test('web opt-in requires period while old callers keep season totals without a schedule fetch', async () => {
    const legacy = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    const explicit = await getLeaderboard({ chatId: 42, leagueCode: 'C7', period: 'season', requirePeriod: true });
    expect(explicit).toEqual(legacy);
    expect(explicit.period).toBe('season');
    expect(explicit.standings[0].totalScore).toBe(1000);
    expect(fetchCurrentSeasonRaces).not.toHaveBeenCalled();
    const picker = await getLeaderboard({ chatId: 42, leagueCode: 'C7', requirePeriod: true });
    expect(picker).toMatchObject({ status: 'select_period', raceOnly: false, races: [
      { matchdayId: 10, raceName: 'Austrian GP' },
      { matchdayId: 2, raceName: 'Australian GP' },
    ] });
    expect(picker.standings).toBeUndefined();
  });
  test('uses only weekend points, competition ranks, gaps, unknowns last and canonical highlighting', async () => {
    cache.userCache['42'] = { selectedTeam: 'C_1_cccccccccccc' };
    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7', matchdayId: 10 });
    expect(result).toMatchObject({ status: 'ok', period: 'race', raceName: 'Austrian GP', matchdayId: 10 });
    expect(result.standings.map((row) => row.totalScore)).toEqual([20, 20, 0, -5, null, null]);
    expect(result.standings.map((row) => row.position)).toEqual([1, 1, 3, 4, null, null]);
    expect(result.standings.map((row) => row.gapToLeader)).toEqual([0, 0, -20, -25, null, null]);
    expect(result.standings.filter((row) => row.isSelected)).toEqual([expect.objectContaining({ teamId: 'C_1_cccccccccccc' })]);
    const negativeLeader = await getLeaderboard({ chatId: 42, leagueCode: 'C7', matchdayId: 2 });
    expect(negativeLeader.standings.slice(0, 2).map((row) => row.gapToLeader)).toEqual([0, -10]);
  });
  test('resolves full or shortened race names case-insensitively and returns ambiguous choices', async () => {
    for (const raceName of [' AUSTRIAN Grand Prix ', 'Austrian', 'Austrian GP']) {
      expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', raceName })).toMatchObject({ status: 'ok', matchdayId: 10 });
    }
    expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', raceName: 'Austr' })).toMatchObject({
      status: 'ambiguous_race', raceOnly: true, races: [{ matchdayId: 10 }, { matchdayId: 2 }],
    });
  });
  test('schedule failure preserves rounds and unavailable races never fall back to season', async () => {
    fetchCurrentSeasonRaces.mockRejectedValue(new Error('down'));
    expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', matchdayId: 10 })).toMatchObject({ status: 'ok', raceName: 'R10' });
    for (const args of [{ matchdayId: 9 }, { raceName: 'Monaco' }]) {
      const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7', ...args });
      expect(result.status).toBe('race_unavailable');
      expect(result.standings).toBeUndefined();
    }
  });
  test('all missing scores produce only the season option, with unavailable requested round', async () => {
    getLeagueData.mockResolvedValue({ teams: [{ raceScores: { matchday_10: null } }] });
    expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', requirePeriod: true })).toMatchObject({ status: 'select_period', races: [] });
    expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', matchdayId: 10 })).toMatchObject({ status: 'race_unavailable' });
  });
  test('does not read league or schedule data for unauthorized race requests', async () => {
    listUserLeagues.mockResolvedValue([]);
    expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', matchdayId: 10 })).toEqual({ status: 'not_followed', leagueCode: 'C7' });
    expect(getLeagueData).not.toHaveBeenCalled();
    expect(fetchCurrentSeasonRaces).not.toHaveBeenCalled();
  });
  test.each([{ matchdayId: 0 }, { matchdayId: 1.5 }, { period: 'invalid' }, { period: 'season', matchdayId: 10 }])('rejects invalid period arguments %j', async (args) => {
    expect(await getLeaderboard({ chatId: 42, leagueCode: 'C7', ...args })).toMatchObject({ status: 'invalid_input' });
  });
});


test('pure standings retain negative leaders, tied zero scores, missing values and input order', () => {
  const teams = [{ userName: 'A', raceScores: { matchday_1: -10, matchday_2: 0 } },
    { userName: 'B', raceScores: { matchday_1: -5, matchday_2: 0 } },
    { userName: 'C', raceScores: { matchday_1: -10 } }, { userName: 'D' }];
  const original = JSON.stringify(teams);
  const negative = buildLeaderboardStandings(teams, { matchdayId: 1 });
  expect(negative.map((row) => row.totalScore)).toEqual([-5, -10, -10, null]);
  expect(negative.map((row) => row.gapToLeader)).toEqual([0, -5, -5, null]);
  expect(negative.map((row) => row.position)).toEqual([1, 2, 2, null]);
  expect(buildLeaderboardStandings(teams, { matchdayId: 2 }).map((row) => row.position)).toEqual([1, 1, null, null]);
  expect(JSON.stringify(teams)).toBe(original);
});
