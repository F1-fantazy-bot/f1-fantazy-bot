jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../utils/leagueTeamHelpers', () => ({
  loadLeagueTeamsData: jest.fn(),
}));

const { listFollowedTeams } = require('./followedTeamsCore');
const cache = require('../cache');
const { listUserLeagues } = require('../leagueRegistryService');
const { loadLeagueTeamsData } = require('../utils/leagueTeamHelpers');

function resetCache() {
  Object.keys(cache.currentTeamCache).forEach(
    (k) => delete cache.currentTeamCache[k],
  );
  Object.keys(cache.userCache).forEach((k) => delete cache.userCache[k]);
}

describe('listFollowedTeams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCache();
  });

  test('returns status=empty when the user has no league teams', async () => {
    cache.currentTeamCache[42] = {
      T1: { teamName: 'My Screenshot Team' },
    };

    const result = await listFollowedTeams({ chatId: 42 });
    expect(result).toEqual({ status: 'empty' });
    expect(listUserLeagues).not.toHaveBeenCalled();
  });

  test('lists a single league team with its single-league context', async () => {
    cache.currentTeamCache[42] = {
      Kilzid_1: { teamName: 'Kilzid' },
    };
    cache.userCache['42'] = { selectedTeam: 'Kilzid_1' };
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'C7', leagueName: 'MSFT ILDC' },
    ]);
    loadLeagueTeamsData.mockResolvedValueOnce({
      teams: [
        { userName: 'Kilzid', teamNo: 1, teamName: 'Kilzid', position: 4 },
        { userName: 'Other', teamNo: 1, teamName: 'Other', position: 1 },
      ],
    });

    const result = await listFollowedTeams({ chatId: 42 });
    expect(result.status).toBe('ok');
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toEqual({
      teamId: 'Kilzid_1',
      teamName: 'Kilzid',
      leagues: [
        { leagueCode: 'C7', leagueName: 'MSFT ILDC', position: 4 },
      ],
      isSelected: true,
    });
  });

  test('dedupes the same fantasy team across multiple leagues', async () => {
    cache.currentTeamCache[42] = {
      Kilzid_1: { teamName: 'Kilzid' },
    };
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'C7', leagueName: 'MSFT ILDC' },
      { leagueCode: 'C8', leagueName: 'Amba' },
    ]);
    loadLeagueTeamsData.mockImplementation((code) => {
      if (code === 'C7') {
        return Promise.resolve({
          teams: [
            { userName: 'Kilzid', teamNo: 1, teamName: 'Kilzid', position: 4 },
          ],
        });
      }

      return Promise.resolve({
        teams: [
          { userName: 'Kilzid', teamNo: 1, teamName: 'Kilzid', position: 2 },
        ],
      });
    });

    const result = await listFollowedTeams({ chatId: 42 });
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].leagues).toHaveLength(2);
    const codes = result.teams[0].leagues.map((l) => l.leagueCode).sort();
    expect(codes).toEqual(['C7', 'C8']);
    expect(result.teams[0].isSelected).toBe(false);
  });

  test('returns tracked teams even when no league blob resolves', async () => {
    cache.currentTeamCache[42] = {
      Kilzid_1: { teamName: 'Kilzid (cached)' },
      Kilzid_2: {},
    };
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'C7', leagueName: 'MSFT ILDC' },
    ]);
    loadLeagueTeamsData.mockRejectedValueOnce(new Error('blob missing'));

    const result = await listFollowedTeams({ chatId: 42 });
    expect(result.status).toBe('ok');
    expect(result.teams.map((t) => t.teamId).sort()).toEqual([
      'Kilzid_1',
      'Kilzid_2',
    ]);
    const kilzid1 = result.teams.find((t) => t.teamId === 'Kilzid_1');
    expect(kilzid1.teamName).toBe('Kilzid (cached)');
    expect(kilzid1.leagues).toEqual([]);
    const kilzid2 = result.teams.find((t) => t.teamId === 'Kilzid_2');
    expect(kilzid2.teamName).toBe('Kilzid_2');
  });

  test('ignores screenshot teams (T1/T2/T3)', async () => {
    cache.currentTeamCache[42] = {
      T1: { teamName: 'Screenshot Team' },
      Kilzid_1: { teamName: 'Kilzid' },
    };
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'C7', leagueName: 'MSFT ILDC' },
    ]);
    loadLeagueTeamsData.mockResolvedValueOnce({
      teams: [
        { userName: 'Kilzid', teamNo: 1, teamName: 'Kilzid', position: 4 },
      ],
    });

    const result = await listFollowedTeams({ chatId: 42 });
    expect(result.teams.map((t) => t.teamId)).toEqual(['Kilzid_1']);
  });
});
