jest.mock('./leagueTeamHelpers', () => ({
  mapNameToCode: jest.fn((name) => name),
}));

const {
  mapLockedTeamForScoring,
  calculateLiveScoreBreakdown,
  deriveLiveScoreOptions,
} = require('./liveScoreCalc');

describe('liveScoreCalc', () => {
  describe('mapLockedTeamForScoring', () => {
    it('maps drivers/constructors and detects captain + mega-captain', () => {
      const lockedTeam = {
        drivers: [
          { name: 'VER', isCaptain: true },
          { name: 'HAM', isMegaCaptain: true },
          { name: 'NOR' },
        ],
        constructors: [{ name: 'MCL' }, { name: 'FER' }],
      };

      expect(mapLockedTeamForScoring(lockedTeam)).toEqual({
        drivers: ['VER', 'HAM', 'NOR'],
        constructors: ['MCL', 'FER'],
        boostDriver: 'VER',
        extraBoostDriver: 'HAM',
      });
    });

    it('handles missing arrays', () => {
      expect(mapLockedTeamForScoring({})).toEqual({
        drivers: [],
        constructors: [],
        boostDriver: null,
        extraBoostDriver: null,
      });
    });
  });

  describe('calculateLiveScoreBreakdown', () => {
    const realTeam = {
      drivers: ['VER', 'HAM'],
      constructors: ['MCL'],
      boostDriver: 'VER',
      extraBoostDriver: null,
    };
    const liveScoreData = {
      drivers: {
        VER: { TotalPoints: 30, PriceChange: 1.2 },
        HAM: { TotalPoints: -5, PriceChange: -0.4 },
      },
      constructors: {
        MCL: { TotalPoints: 20, PriceChange: 0.5 },
      },
    };

    it('applies captain x2 multiplier and accumulates totals', () => {
      const result = calculateLiveScoreBreakdown(realTeam, liveScoreData);

      // VER 30 + 30 (boost) + HAM -5 + MCL 20 = 75
      expect(result.totalPoints).toBe(75);
      expect(result.pointsBeforePenalty).toBe(75);
      expect(result.transferPenalty).toBe(0);
      expect(result.totalPriceChange).toBeCloseTo(1.3);
      expect(result.missingMembers).toEqual([]);
    });

    it('applies mega-captain x3 multiplier in place of x2', () => {
      const result = calculateLiveScoreBreakdown(
        { ...realTeam, boostDriver: null, extraBoostDriver: 'VER' },
        liveScoreData,
      );

      // VER 30 + 30*2 (extra boost added) + HAM -5 + MCL 20 = 105
      expect(result.totalPoints).toBe(105);
    });

    it('clamps negative member points when noNegativeActive', () => {
      const result = calculateLiveScoreBreakdown(realTeam, liveScoreData, {
        noNegativeActive: true,
      });

      // HAM -5 → 0. VER 30 + 30 (boost) + 0 + MCL 20 = 80
      expect(result.totalPoints).toBe(80);
      expect(result.noNegativeApplied).toBe(true);
    });

    it('subtracts transferPenalty from totalPoints', () => {
      const result = calculateLiveScoreBreakdown(realTeam, liveScoreData, {
        transferPenalty: 10,
      });

      expect(result.pointsBeforePenalty).toBe(75);
      expect(result.transferPenalty).toBe(10);
      expect(result.totalPoints).toBe(65);
    });

    it('flags missing members and treats them as 0', () => {
      const result = calculateLiveScoreBreakdown(
        { ...realTeam, drivers: ['VER', 'MISSING_DRIVER'] },
        liveScoreData,
      );

      expect(result.missingMembers).toEqual(['MISSING_DRIVER']);
      // VER 30 + 30 (boost) + missing 0 + MCL 20 = 80
      expect(result.totalPoints).toBe(80);
    });
  });

  describe('deriveLiveScoreOptions', () => {
    it('returns no penalty / no clamp when transfers in range and no chip', () => {
      expect(
        deriveLiveScoreOptions({
          transfersRemaining: 1,
          chipsUsed: [],
          matchdayId: 5,
        }),
      ).toEqual({ noNegativeActive: false, transferPenalty: 0 });
    });

    it('applies 10-pt penalty per excess transfer', () => {
      expect(
        deriveLiveScoreOptions({
          transfersRemaining: -2,
          chipsUsed: [],
          matchdayId: 5,
        }),
      ).toEqual({ noNegativeActive: false, transferPenalty: 20 });
    });

    it('waives penalty when Wildcard is active for this matchday', () => {
      expect(
        deriveLiveScoreOptions({
          transfersRemaining: -3,
          chipsUsed: [{ name: 'Wildcard', gameDayId: 5 }],
          matchdayId: 5,
        }),
      ).toEqual({ noNegativeActive: false, transferPenalty: 0 });
    });

    it('does NOT waive penalty when Wildcard is for a different matchday', () => {
      expect(
        deriveLiveScoreOptions({
          transfersRemaining: -2,
          chipsUsed: [{ name: 'Wildcard', gameDayId: 4 }],
          matchdayId: 5,
        }),
      ).toEqual({ noNegativeActive: false, transferPenalty: 20 });
    });

    it('flags noNegativeActive when No Negative chip is for this matchday', () => {
      expect(
        deriveLiveScoreOptions({
          transfersRemaining: 0,
          chipsUsed: [{ name: 'No Negative', gameDayId: 5 }],
          matchdayId: 5,
        }),
      ).toEqual({ noNegativeActive: true, transferPenalty: 0 });
    });
  });
});
