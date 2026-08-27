jest.mock('../azureStorageService', () => ({
  saveUserTeam: jest.fn(),
  deleteUserTeam: jest.fn(),
}));
jest.mock('../services/activateChipService', () => ({
  clearTeamDerivedPreferences: jest.fn(),
  runChipMutation: jest.fn(async (_chatId, operation) => operation()),
}));

const azureStorageService = require('../azureStorageService');
const {
  clearTeamDerivedPreferences,
} = require('../services/activateChipService');
const { currentTeamCache, userCache } = require('../cache');
const {
  mapLeagueTeamToBotTeam,
  followLeagueTeam,
  removeFollowedTeam,
} = require('./leagueTeamHelpers');

describe('mapLeagueTeamToBotTeam', () => {
  // A representative league-team blob as the scraper writes it after
  // f1-fantasy-api-data PR #19 (where `budget` is the user's cost cap
  // = team_info.maxTeambal). Prices match the real Kilzid team observed
  // in production: drivers sum to 53.4, constructors sum to 53.4
  // → team value 106.8, cost cap 109.2 → 2.4 cap remaining.
  function fixture(overrides = {}) {
    return {
      teamName: 'Kilzid',
      userName: 'Doron Kilzi',
      teamNo: 1,
      position: 4,
      budget: 109.2,
      transfersRemaining: 2,
      drivers: [
        { id: '1', name: 'M. Verstappen', price: 15.0, isCaptain: true },
        { id: '2', name: 'L. Norris', price: 12.0 },
        { id: '3', name: 'L. Hamilton', price: 10.0 },
        { id: '4', name: 'O. Bearman', price: 9.4 },
        { id: '5', name: 'L. Stroll', price: 7.0 },
      ],
      constructors: [
        { id: '6', name: 'McLaren', price: 30.0 },
        { id: '7', name: 'Ferrari', price: 23.4 },
      ],
      ...overrides,
    };
  }

  it('maps the canonical happy-path team shape', () => {
    const result = mapLeagueTeamToBotTeam(fixture());
    expect(result).toEqual({
      drivers: ['VER', 'NOR', 'HAM', 'BEA', 'STR'],
      driverIds: ['1', '2', '3', '4', '5'],
      constructors: ['MCL', 'FER'],
      constructorIds: ['6', '7'],
      boost: 'VER',
      boostDriverId: '1',
      freeTransfers: 2,
      costCapRemaining: 2.4,
      teamName: 'Kilzid',
      userName: 'Doron Kilzi',
      teamNo: 1,
    });
  });

  it('treats leagueTeam.budget as the cost cap', () => {
    // Team value is 106.8, varying the cap should move cap-remaining 1:1.
    expect(mapLeagueTeamToBotTeam(fixture()).costCapRemaining).toBe(2.4);
    expect(
      mapLeagueTeamToBotTeam(fixture({ budget: 108.5 })).costCapRemaining,
    ).toBe(1.7);
    expect(
      mapLeagueTeamToBotTeam(fixture({ budget: 106.8 })).costCapRemaining,
    ).toBe(0);
  });

  describe('followLeagueTeam', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      delete currentTeamCache[42];
      delete userCache['42'];
      azureStorageService.saveUserTeam.mockResolvedValue(undefined);
      azureStorageService.deleteUserTeam.mockResolvedValue(undefined);
      clearTeamDerivedPreferences.mockResolvedValue({});
    });

    afterEach(() => {
      delete currentTeamCache[42];
      delete userCache['42'];
    });

    test('rolls back blob and cache when selected-best CAS fails', async () => {
      const error = new Error('CAS unavailable');
      clearTeamDerivedPreferences.mockRejectedValue(error);
      const bot = {};

      await expect(
        followLeagueTeam(bot, 42, {
          teamId: 'Owner_1',
          leagueTeam: {
            teamName: 'Team',
            userName: 'Owner',
            teamNo: 1,
            budget: 100,
            transfersRemaining: 2,
            drivers: [],
            constructors: [],
          },
        }),
      ).rejects.toThrow('CAS unavailable');

      expect(azureStorageService.deleteUserTeam).toHaveBeenCalledWith(
        bot,
        42,
        'Owner_1',
      );
      expect(currentTeamCache[42]).toBeUndefined();
    });

    test('keeps preferences and cache when blob deletion fails', async () => {
      const teamData = { drivers: ['VER'] };
      currentTeamCache[42] = { Owner_1: teamData };
      userCache['42'] = { selectedTeam: 'Owner_1' };
      azureStorageService.deleteUserTeam.mockRejectedValue(
        new Error('blob unavailable'),
      );

      await expect(
        removeFollowedTeam({}, 42, 'Owner_1'),
      ).rejects.toThrow('blob unavailable');
      expect(clearTeamDerivedPreferences).not.toHaveBeenCalled();
      expect(currentTeamCache[42].Owner_1).toBe(teamData);
    });

    test('restores the deleted blob when preference CAS fails', async () => {
      const teamData = { drivers: ['VER'] };
      const bot = {};
      currentTeamCache[42] = { Owner_1: teamData };
      userCache['42'] = { selectedTeam: 'Owner_1' };
      clearTeamDerivedPreferences.mockRejectedValue(
        new Error('CAS unavailable'),
      );

      await expect(
        removeFollowedTeam(bot, 42, 'Owner_1'),
      ).rejects.toThrow('CAS unavailable');
      expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
        bot,
        42,
        'Owner_1',
        teamData,
      );
      expect(currentTeamCache[42].Owner_1).toBe(teamData);
    });
  });

  it('gracefully degrades to 0 for stale blobs where budget = teamValue', () => {
    // Documents the transition-window contract: blobs written before
    // f1-fantasy-api-data PR #19 carry `budget = team_info.teamVal`
    // (= Σ_prices). The mapper subtracts Σ_prices from budget, getting
    // ~0 — same as production today, no regression.
    expect(
      mapLeagueTeamToBotTeam(fixture({ budget: 106.8 })).costCapRemaining,
    ).toBe(0);
  });

  it('clamps negative caps to 0 (over-budget team)', () => {
    // If the upstream API ever returns a cap below the team value
    // (mid-week price drops dipping the cap below the roster total),
    // don't propagate negative numbers.
    expect(
      mapLeagueTeamToBotTeam(fixture({ budget: 100 })).costCapRemaining,
    ).toBe(0);
  });

  it('rounds costCapRemaining to 2 decimals', () => {
    expect(
      mapLeagueTeamToBotTeam(fixture({ budget: 109.234 })).costCapRemaining,
    ).toBe(2.43);
    expect(
      mapLeagueTeamToBotTeam(fixture({ budget: 109.235 })).costCapRemaining,
    ).toBe(2.44);
  });

  it('returns 0 cap when budget is absent', () => {
    const team = fixture();
    delete team.budget;
    expect(mapLeagueTeamToBotTeam(team).costCapRemaining).toBe(0);
  });

  it('picks a captain via isCaptain', () => {
    expect(mapLeagueTeamToBotTeam(fixture()).boost).toBe('VER');
  });

  it('picks an isMegaCaptain when no isCaptain is set', () => {
    const team = fixture({
      drivers: [
        { id: '1', name: 'M. Verstappen', price: 15.0 },
        { id: '2', name: 'L. Norris', price: 12.0, isMegaCaptain: true },
        { id: '3', name: 'L. Hamilton', price: 10.0 },
        { id: '4', name: 'O. Bearman', price: 9.4 },
        { id: '5', name: 'L. Stroll', price: 7.0 },
      ],
    });
    expect(mapLeagueTeamToBotTeam(team).boost).toBe('NOR');
  });

  it('falls back to the first driver when no captain flag is set', () => {
    const team = fixture({
      drivers: [
        { id: '1', name: 'M. Verstappen', price: 15.0 },
        { id: '2', name: 'L. Norris', price: 12.0 },
      ],
    });
    expect(mapLeagueTeamToBotTeam(team).boost).toBe('VER');
  });

  it('clamps a negative transfersRemaining to 0', () => {
    expect(
      mapLeagueTeamToBotTeam(fixture({ transfersRemaining: -2 })).freeTransfers,
    ).toBe(0);
  });

  it('omits optional metadata fields when absent', () => {
    const team = fixture();
    delete team.teamName;
    delete team.userName;
    delete team.teamNo;
    const result = mapLeagueTeamToBotTeam(team);
    expect(result).not.toHaveProperty('teamName');
    expect(result).not.toHaveProperty('userName');
    expect(result).not.toHaveProperty('teamNo');
  });
});
