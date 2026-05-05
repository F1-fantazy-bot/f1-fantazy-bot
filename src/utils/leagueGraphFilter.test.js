const {
  isExcludedFromGraphs,
  filterExcludedGraphTeams,
} = require('./leagueGraphFilter');

describe('leagueGraphFilter', () => {
  describe('isExcludedFromGraphs', () => {
    it('matches the configured name on teamName (exact)', () => {
      expect(isExcludedFromGraphs({ teamName: 'the best bot' })).toBe(true);
    });

    it('does NOT match on userName even when userName is the configured name', () => {
      expect(
        isExcludedFromGraphs({ teamName: 'Cooperon', userName: 'the best bot' }),
      ).toBe(false);
      expect(isExcludedFromGraphs({ userName: 'The Best Bot' })).toBe(false);
    });

    it('matches case-insensitively (teamName)', () => {
      expect(isExcludedFromGraphs({ teamName: 'The Best Bot' })).toBe(true);
      expect(isExcludedFromGraphs({ teamName: 'THE BEST BOT' })).toBe(true);
      expect(isExcludedFromGraphs({ teamName: 'tHe BeSt BoT' })).toBe(true);
    });

    it('trims surrounding whitespace before matching (teamName)', () => {
      expect(isExcludedFromGraphs({ teamName: '  The Best Bot  ' })).toBe(true);
      expect(isExcludedFromGraphs({ teamName: '\tthe best bot\n' })).toBe(true);
    });

    it('does not match unrelated names', () => {
      expect(isExcludedFromGraphs({ teamName: 'Best Bot' })).toBe(false);
      expect(isExcludedFromGraphs({ teamName: 'The Best' })).toBe(false);
      expect(
        isExcludedFromGraphs({ teamName: 'the best bot squad' }),
      ).toBe(false);
    });

    it('returns false for missing fields, missing team, or non-string teamName', () => {
      expect(isExcludedFromGraphs(null)).toBe(false);
      expect(isExcludedFromGraphs(undefined)).toBe(false);
      expect(isExcludedFromGraphs({})).toBe(false);
      expect(isExcludedFromGraphs({ teamName: 42 })).toBe(false);
      expect(isExcludedFromGraphs({ teamName: null })).toBe(false);
    });
  });

  describe('filterExcludedGraphTeams', () => {
    it('removes teams whose teamName matches', () => {
      const teams = [
        { teamName: 'Cooperon', userName: 'Ron Cooper' },
        { teamName: 'The Best Bot', userName: 'Doron Kilzi' },
        { teamName: 'Kilzid', userName: 'Doron Kilzi' },
      ];
      expect(filterExcludedGraphTeams(teams)).toEqual([
        { teamName: 'Cooperon', userName: 'Ron Cooper' },
        { teamName: 'Kilzid', userName: 'Doron Kilzi' },
      ]);
    });

    it('keeps teams whose userName matches the bot name but whose teamName does not', () => {
      const teams = [
        { teamName: 'PerfectlyNormalTeam', userName: 'the best bot' },
        { teamName: 'Cooperon', userName: 'Ron Cooper' },
      ];
      expect(filterExcludedGraphTeams(teams)).toEqual(teams);
    });

    it('returns an empty array for non-array input', () => {
      expect(filterExcludedGraphTeams(null)).toEqual([]);
      expect(filterExcludedGraphTeams(undefined)).toEqual([]);
      expect(filterExcludedGraphTeams('teams')).toEqual([]);
      expect(filterExcludedGraphTeams({ teams: [] })).toEqual([]);
    });

    it('returns the original array contents when nothing matches', () => {
      const teams = [
        { teamName: 'Cooperon', userName: 'Ron Cooper' },
        { teamName: 'Kilzid', userName: 'Doron Kilzi' },
      ];
      expect(filterExcludedGraphTeams(teams)).toEqual(teams);
    });
  });
});
