jest.mock('../cache', () => ({
  getSelectedTeam: jest.fn(),
}));

jest.mock('./leagueTeamHelpers', () => ({
  loadLeagueTeamsData: jest.fn(),
  extractLeagueCode: jest.requireActual('./leagueTeamHelpers').extractLeagueCode,
}));

const { getSelectedTeam } = require('../cache');
const { loadLeagueTeamsData } = require('./leagueTeamHelpers');
const {
  buildFantasyId,
  isHighlightedTeam,
  resolveActiveTeamFantasyId,
} = require('./activeTeamIdentity');

describe('activeTeamIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildFantasyId', () => {
    it('joins userName and teamNo with an underscore', () => {
      expect(buildFantasyId({ userName: 'dorsegal', teamNo: 2 })).toBe(
        'dorsegal_2',
      );
    });

    it('handles teamNo = 1 (single-team users)', () => {
      expect(buildFantasyId({ userName: 'kilzid', teamNo: 1 })).toBe(
        'kilzid_1',
      );
    });

    it('returns null when userName is missing or empty', () => {
      expect(buildFantasyId({ teamNo: 1 })).toBeNull();
      expect(buildFantasyId({ userName: '', teamNo: 1 })).toBeNull();
    });

    it('returns null when teamNo is missing (old blobs without the field)', () => {
      expect(buildFantasyId({ userName: 'dorsegal' })).toBeNull();
      expect(buildFantasyId({ userName: 'dorsegal', teamNo: null })).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(buildFantasyId(null)).toBeNull();
      expect(buildFantasyId(undefined)).toBeNull();
    });
  });

  describe('isHighlightedTeam', () => {
    it('matches by same-league teamId', () => {
      const team = { teamName: 'Cooperon', userName: 'Ron', teamNo: 1 };
      const result = isHighlightedTeam(team, 'ABC', {
        teamId: 'ABC_Cooperon',
        fantasyId: null,
      });
      expect(result).toBe(true);
    });

    it('does NOT match same-league teamId when leagueCode differs', () => {
      const team = { teamName: 'Cooperon', userName: 'Ron', teamNo: 1 };
      const result = isHighlightedTeam(team, 'XYZ', {
        teamId: 'ABC_Cooperon',
        fantasyId: null,
      });
      expect(result).toBe(false);
    });

    it('matches by cross-league fantasyId', () => {
      const team = { teamName: 'Cooperon', userName: 'Ron', teamNo: 1 };
      const result = isHighlightedTeam(team, 'XYZ', {
        teamId: 'ABC_Cooperon',
        fantasyId: 'Ron_1',
      });
      expect(result).toBe(true);
    });

    it('disambiguates a user with multiple teams via teamNo', () => {
      const t1 = { teamName: 'dorsegal1', userName: 'dorsegal', teamNo: 1 };
      const t2 = { teamName: 'dorsegal2', userName: 'dorsegal', teamNo: 2 };
      const t3 = { teamName: 'dorsegal3', userName: 'dorsegal', teamNo: 3 };
      const highlight = { teamId: null, fantasyId: 'dorsegal_2' };

      expect(isHighlightedTeam(t1, 'XYZ', highlight)).toBe(false);
      expect(isHighlightedTeam(t2, 'XYZ', highlight)).toBe(true);
      expect(isHighlightedTeam(t3, 'XYZ', highlight)).toBe(false);
    });

    it('returns false when team has no teamNo and no same-league teamId match', () => {
      const team = { teamName: 'Cooperon', userName: 'Ron' }; // legacy blob, no teamNo
      const result = isHighlightedTeam(team, 'XYZ', {
        teamId: 'ABC_Cooperon',
        fantasyId: 'Ron_1',
      });
      expect(result).toBe(false);
    });

    it('returns false for null/undefined inputs', () => {
      expect(isHighlightedTeam(null, 'ABC', { teamId: 'ABC_X' })).toBe(false);
      expect(
        isHighlightedTeam({ teamName: 'X' }, 'ABC', null),
      ).toBe(false);
      expect(
        isHighlightedTeam({ teamName: 'X' }, 'ABC', undefined),
      ).toBe(false);
    });

    it('empty highlight fields never match', () => {
      const team = { teamName: 'Cooperon', userName: 'Ron', teamNo: 1 };
      expect(
        isHighlightedTeam(team, 'ABC', { teamId: '', fantasyId: '' }),
      ).toBe(false);
      expect(isHighlightedTeam(team, 'ABC', {})).toBe(false);
    });
  });

  describe('resolveActiveTeamFantasyId', () => {
    it('returns null when there is no selected team', async () => {
      getSelectedTeam.mockReturnValue(null);

      await expect(resolveActiveTeamFantasyId(123)).resolves.toBeNull();
      expect(loadLeagueTeamsData).not.toHaveBeenCalled();
    });

    it('returns null for screenshot teams (T1/T2/T3)', async () => {
      getSelectedTeam.mockReturnValue('T1');

      await expect(resolveActiveTeamFantasyId(123)).resolves.toBeNull();
      expect(loadLeagueTeamsData).not.toHaveBeenCalled();
    });

    it('returns teamId + fantasyId for a league team with teamNo present', async () => {
      getSelectedTeam.mockReturnValue('ABC_Cooperon');
      loadLeagueTeamsData.mockResolvedValueOnce({
        leagueCode: 'ABC',
        teams: [
          { teamName: 'Other', userName: 'someone', teamNo: 1 },
          { teamName: 'Cooperon', userName: 'Ron', teamNo: 2 },
        ],
      });

      await expect(resolveActiveTeamFantasyId(123)).resolves.toEqual({
        teamId: 'ABC_Cooperon',
        fantasyId: 'Ron_2',
      });
      expect(loadLeagueTeamsData).toHaveBeenCalledWith('ABC');
    });

    it('returns teamId with fantasyId=null when the matched team lacks teamNo (old blob)', async () => {
      getSelectedTeam.mockReturnValue('ABC_Cooperon');
      loadLeagueTeamsData.mockResolvedValueOnce({
        leagueCode: 'ABC',
        teams: [{ teamName: 'Cooperon', userName: 'Ron' }], // no teamNo
      });

      await expect(resolveActiveTeamFantasyId(123)).resolves.toEqual({
        teamId: 'ABC_Cooperon',
        fantasyId: null,
      });
    });

    it('returns teamId with fantasyId=null when no team matches the sanitized name', async () => {
      getSelectedTeam.mockReturnValue('ABC_Cooperon');
      loadLeagueTeamsData.mockResolvedValueOnce({
        leagueCode: 'ABC',
        teams: [{ teamName: 'Different', userName: 'Whoever', teamNo: 1 }],
      });

      await expect(resolveActiveTeamFantasyId(123)).resolves.toEqual({
        teamId: 'ABC_Cooperon',
        fantasyId: null,
      });
    });

    it('returns teamId with fantasyId=null when league data is unavailable', async () => {
      getSelectedTeam.mockReturnValue('ABC_Cooperon');
      loadLeagueTeamsData.mockResolvedValueOnce(null);

      await expect(resolveActiveTeamFantasyId(123)).resolves.toEqual({
        teamId: 'ABC_Cooperon',
        fantasyId: null,
      });
    });

    it('returns teamId with fantasyId=null when loadLeagueTeamsData throws', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getSelectedTeam.mockReturnValue('ABC_Cooperon');
      loadLeagueTeamsData.mockRejectedValueOnce(new Error('boom'));

      await expect(resolveActiveTeamFantasyId(123)).resolves.toEqual({
        teamId: 'ABC_Cooperon',
        fantasyId: null,
      });
      consoleSpy.mockRestore();
    });
  });
});
