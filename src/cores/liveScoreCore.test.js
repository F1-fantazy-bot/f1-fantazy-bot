jest.mock('../azureStorageService', () => ({
  getLiveScoreData: jest.fn(),
  getLockedTeamsData: jest.fn(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../cache', () => ({
  getSelectedTeam: jest.fn(),
}));

jest.mock('../utils/leagueTeamHelpers', () => ({
  mapNameToCode: (name) => name,
}));

const {
  getLiveScoreData,
  getLockedTeamsData,
} = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { getSelectedTeam } = require('../cache');
const { buildLeagueTeamId } = require('../utils/teamId');
const {
  getLiveScoreForTeam,
  getLiveScoreLeaderboard,
  listLeagueTeams,
} = require('./liveScoreCore');

const CHAT_ID = 12345;
const LEAGUE_CODE = 'TESTLEAGUE';

const baseLockedTeam = (overrides = {}) => ({
  teamName: 'Kilzi',
  userName: 'Doron-Kilzi',
  teamNo: 1,
  position: 1,
  drivers: [
    { name: 'VER', isCaptain: true },
    { name: 'HAM' },
  ],
  constructors: [{ name: 'MCL' }],
  transfersRemaining: 1,
  chipsUsed: [],
  matchdayId: 5,
  ...overrides,
});

const baseLiveScoreData = {
  extractedAt: '2026-05-17T12:00:00Z',
  drivers: {
    VER: { TotalPoints: 30, PriceChange: 1.0 },
    HAM: { TotalPoints: 10, PriceChange: 0.2 },
  },
  constructors: {
    MCL: { TotalPoints: 15, PriceChange: 0.5 },
  },
};

describe('getLiveScoreForTeam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSelectedTeam.mockReturnValue(null);
  });

  it('returns invalid_input when both leagueCode and leagueName are missing', async () => {
    const result = await getLiveScoreForTeam({ chatId: CHAT_ID });
    expect(result.status).toBe('invalid_input');
  });

  it('returns not_followed when user does not follow leagueCode', async () => {
    listUserLeagues.mockResolvedValue([]);
    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });
    expect(result.status).toBe('not_followed');
  });

  it('resolves leagueName (case-insensitive substring) to leagueCode', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Kilzi Test' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Kilzi Test',
      matchdayId: 5,
      teams: [baseLockedTeam()],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueName: 'kilzi test',
      teamName: 'Kilzi',
    });

    expect(result.status).toBe('ok');
    expect(result.leagueCode).toBe(LEAGUE_CODE);
    expect(getLockedTeamsData).toHaveBeenCalledWith(LEAGUE_CODE);
  });

  it('falls back from teamId (no match) to teamName when both are explicitly provided', async () => {
    // Verifies pickLockedTeam's teamId→teamName fallback chain.
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      // userName WITHOUT the dash that the teamId was built with, so
      // buildLeagueTeamId(t.userName, t.teamNo) won't match the supplied
      // teamId — but the teamName fallback should fire.
      teams: [
        baseLockedTeam({ userName: 'Doron K', teamNo: 2, teamName: 'Kilzid2' }),
      ],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
      teamId: 'Doron-Kilzi_2',
      teamName: 'Kilzid2',
    });

    expect(result.status).toBe('ok');
    expect(result.teamName).toBe('Kilzid2');
  });

  it('returns not_found when locked snapshot is empty', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({ teams: [] });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });
    expect(result.status).toBe('not_found');
  });

  it('returns ok with breakdown when teamName matches', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      teams: [baseLockedTeam()],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
      teamName: 'Kilzi',
    });

    expect(result.status).toBe('ok');
    expect(result.leagueName).toBe('Test League');
    expect(result.matchdayId).toBe(5);
    expect(result.extractedAt).toBe('2026-05-17T12:00:00Z');
    // VER 30 + 30 (boost) + HAM 10 + MCL 15 = 85
    expect(result.breakdown.totalPoints).toBe(85);
    expect(result.breakdown.driverBreakdown).toHaveLength(2);
    expect(result.teamId).toBe(buildLeagueTeamId('Doron-Kilzi', 1));
  });

  it('returns ok with breakdown when teamId matches', async () => {
    const teamId = buildLeagueTeamId('Doron-Kilzi', 1);
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      teams: [baseLockedTeam()],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
      teamId,
    });

    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(teamId);
  });

  it('returns team_not_found with availableTeams when no team args are provided (no selectedTeam fallback)', async () => {
    // Per design: the LLM must ASK which team via clarify-and-focus.
    // The core no longer auto-defaults to selectedTeam.
    const teamId = buildLeagueTeamId('Doron-Kilzi', 1);
    getSelectedTeam.mockReturnValue(teamId);
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      teams: [baseLockedTeam()],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });

    expect(result.status).toBe('team_not_found');
    expect(result.reason).toBe('no_team_specified');
    expect(result.availableTeams).toHaveLength(1);
  });

  it('returns team_not_found with availableTeams when teamName not in snapshot', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      teams: [baseLockedTeam()],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreForTeam({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
      teamName: 'Nonexistent',
    });

    expect(result.status).toBe('team_not_found');
    expect(result.availableTeams).toHaveLength(1);
  });
});

describe('getLiveScoreLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSelectedTeam.mockReturnValue(null);
  });

  it('returns ok with sorted rows + isSelected highlight', async () => {
    const selectedId = buildLeagueTeamId('Doron-Kilzi', 1);
    getSelectedTeam.mockReturnValue(selectedId);
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      teams: [
        baseLockedTeam({ userName: 'Other', teamNo: 1, position: 2 }),
        baseLockedTeam(), // Doron-Kilzi_1 has VER captain
      ],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreLeaderboard({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });

    expect(result.status).toBe('ok');
    expect(result.rows).toHaveLength(2);
    // Both teams have the same drivers/constructors → identical scores
    // (sort tie-break: totalPriceChange). The selected team should still
    // get isSelected = true.
    const selectedRow = result.rows.find((r) => r.teamId === selectedId);
    expect(selectedRow).toBeDefined();
    expect(selectedRow.isSelected).toBe(true);
    expect(result.selectedTeamId).toBe(selectedId);
  });

  it('returns not_followed when leagueCode not in user leagues', async () => {
    listUserLeagues.mockResolvedValue([]);
    const result = await getLiveScoreLeaderboard({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });
    expect(result.status).toBe('not_followed');
  });

  it('sorts by totalPoints desc with totalPriceChange as tie-break', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Test League' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Test League',
      matchdayId: 5,
      teams: [
        baseLockedTeam({
          userName: 'Low',
          teamNo: 1,
          drivers: [{ name: 'HAM' }],
          constructors: [],
        }),
        baseLockedTeam({
          userName: 'High',
          teamNo: 1,
          drivers: [{ name: 'VER', isCaptain: true }],
          constructors: [{ name: 'MCL' }],
        }),
      ],
    });
    getLiveScoreData.mockResolvedValue(baseLiveScoreData);

    const result = await getLiveScoreLeaderboard({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });
    expect(result.rows[0].userName).toBe('High');
    expect(result.rows[0].totalPoints).toBeGreaterThan(result.rows[1].totalPoints);
  });
});

describe('listLeagueTeams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSelectedTeam.mockReturnValue(null);
  });

  it('returns ALL teams in the league (the full roster), sorted by position asc', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Kilzi Test' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Kilzi Test',
      matchdayId: 5,
      teams: [
        baseLockedTeam({ userName: 'B', teamNo: 1, teamName: 'B-team', position: 3 }),
        baseLockedTeam({ userName: 'A', teamNo: 1, teamName: 'A-team', position: 1 }),
        baseLockedTeam({ userName: 'C', teamNo: 1, teamName: 'C-team', position: 2 }),
      ],
    });

    const result = await listLeagueTeams({
      chatId: CHAT_ID,
      leagueName: 'kilzi test',
    });

    expect(result.status).toBe('ok');
    expect(result.teams).toHaveLength(3);
    expect(result.teams.map((t) => t.teamName)).toEqual(['A-team', 'C-team', 'B-team']);
    expect(result.leagueCode).toBe(LEAGUE_CODE);
  });

  it("marks the user's own team with isSelected: true", async () => {
    const selectedId = buildLeagueTeamId('Doron-Kilzi', 2);
    getSelectedTeam.mockReturnValue(selectedId);
    listUserLeagues.mockResolvedValue([
      { leagueCode: LEAGUE_CODE, leagueName: 'Kilzi Test' },
    ]);
    getLockedTeamsData.mockResolvedValue({
      leagueName: 'Kilzi Test',
      matchdayId: 5,
      teams: [
        baseLockedTeam({
          userName: 'Doron Kilzi',
          teamNo: 2,
          teamName: 'Kilzid2',
          position: 5,
        }),
        baseLockedTeam({
          userName: 'Other',
          teamNo: 1,
          teamName: 'Other Team',
          position: 1,
        }),
      ],
    });

    const result = await listLeagueTeams({
      chatId: CHAT_ID,
      leagueName: 'Kilzi Test',
    });

    const ownTeam = result.teams.find((t) => t.teamName === 'Kilzid2');
    expect(ownTeam.isSelected).toBe(true);
    const otherTeam = result.teams.find((t) => t.teamName === 'Other Team');
    expect(otherTeam.isSelected).toBe(false);
  });

  it('returns not_followed when leagueCode not in user leagues', async () => {
    listUserLeagues.mockResolvedValue([]);
    const result = await listLeagueTeams({
      chatId: CHAT_ID,
      leagueCode: LEAGUE_CODE,
    });
    expect(result.status).toBe('not_followed');
  });

  it('returns invalid_input when both leagueCode and leagueName are missing', async () => {
    const result = await listLeagueTeams({ chatId: CHAT_ID });
    expect(result.status).toBe('invalid_input');
  });
});
