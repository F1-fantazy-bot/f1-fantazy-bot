jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
}));

const { getLeaderboard } = require('./leaderboardCore');
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
    cache.userCache['42'] = { selectedTeam: 'Kilzid_1' };
    listUserLeagues.mockResolvedValue([{ leagueCode: 'C7' }]);
    getLeagueData.mockResolvedValue({
      leagueName: 'MSFT ILDC 2026 League',
      leagueId: 2976007,
      memberCount: 3,
      fetchedAt: '2026-05-17T00:00:00Z',
      teams: [
        { position: 3, teamName: 'Other2', userName: 'Other2', teamNo: 1, totalScore: 900 },
        { position: 1, teamName: 'Cooperon', userName: 'Cooperon', teamNo: 1, totalScore: 1223 },
        { position: 2, teamName: 'Kilzid', userName: 'Kilzid', teamNo: 1, totalScore: 1100 },
      ],
    });

    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    expect(result.status).toBe('ok');
    expect(result.leagueCode).toBe('C7');
    expect(result.leagueName).toBe('MSFT ILDC 2026 League');
    expect(result.memberCount).toBe(3);
    expect(result.fetchedAt).toBe('2026-05-17T00:00:00Z');
    expect(result.selectedTeamId).toBe('Kilzid_1');

    const positions = result.standings.map((s) => s.position);
    expect(positions).toEqual([1, 2, 3]);

    const cooperon = result.standings[0];
    expect(cooperon).toMatchObject({
      teamName: 'Cooperon',
      teamId: 'Cooperon_1',
      totalScore: 1223,
      gapToLeader: 0,
      isSelected: false,
    });

    const kilzid = result.standings[1];
    expect(kilzid).toMatchObject({
      teamName: 'Kilzid',
      teamId: 'Kilzid_1',
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
        { teamName: 'Mystery', userName: 'M', teamNo: 1 },
      ],
    });

    const result = await getLeaderboard({ chatId: 42, leagueCode: 'C7' });
    expect(result.status).toBe('ok');
    expect(result.standings[0]).toMatchObject({
      position: null,
      totalScore: null,
      gapToLeader: null,
      teamId: 'M_1',
    });
  });
});
