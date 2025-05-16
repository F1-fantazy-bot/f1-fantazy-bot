const { calculateBestTeams } = require('./bestTeamsCalculator');
const { calculateChangesToTeam } = require('./bestTeamsCalculator');

describe('calculateBestTeams', () => {
  const mockDrivers = {
    VER: { DR: 'VER', price: 30, expectedPoints: 25, expectedPriceChange: 0.2 },
    HAM: { DR: 'HAM', price: 28, expectedPoints: 20, expectedPriceChange: 0.1 },
    PER: {
      DR: 'PER',
      price: 25,
      expectedPoints: 15,
      expectedPriceChange: -0.1,
    },
    SAI: { DR: 'SAI', price: 23, expectedPoints: 18, expectedPriceChange: 0.3 },
    LEC: { DR: 'LEC', price: 24, expectedPoints: 19, expectedPriceChange: 0.1 },
    NOR: { DR: 'NOR', price: 20, expectedPoints: 12, expectedPriceChange: 0 },
  };

  const mockConstructors = {
    RED: { CN: 'RED', price: 35, expectedPoints: 30, expectedPriceChange: 0.5 },
    MER: { CN: 'MER', price: 32, expectedPoints: 25, expectedPriceChange: 0.2 },
    FER: {
      CN: 'FER',
      price: 30,
      expectedPoints: 20,
      expectedPriceChange: -0.1,
    },
  };

  const mockCurrentTeam = {
    drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
    constructors: ['RED', 'MER'],
    drsBoost: 'VER',
    freeTransfers: 2,
    costCapRemaining: 10,
  };

  const mockJsonData = {
    Drivers: mockDrivers,
    Constructors: mockConstructors,
    CurrentTeam: mockCurrentTeam,
  };

  it('should return an array of team combinations', () => {
    const result = calculateBestTeams(mockJsonData);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return max 20 teams', () => {
    const result = calculateBestTeams(mockJsonData);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('each team should have required properties', () => {
    const result = calculateBestTeams(mockJsonData);
    const team = result[0];

    expect(team).toHaveProperty('row');
    expect(team).toHaveProperty('drivers');
    expect(team).toHaveProperty('constructors');
    expect(team).toHaveProperty('drs_driver');
    expect(team).toHaveProperty('total_price');
    expect(team).toHaveProperty('transfers_needed');
    expect(team).toHaveProperty('penalty');
    expect(team).toHaveProperty('projected_points');
    expect(team).toHaveProperty('expected_price_change');
  });

  it('should select driver with highest points as DRS driver', () => {
    const result = calculateBestTeams(mockJsonData);
    const team = result[0];
    const drsDriver = team.drs_driver;

    const drsDriverPoints = mockDrivers[drsDriver].expectedPoints;
    const teamDrivers = team.drivers.map((d) => mockDrivers[d].expectedPoints);

    expect(drsDriverPoints).toBe(Math.max(...teamDrivers));
  });

  it('should calculate correct penalties based on transfers', () => {
    const result = calculateBestTeams(mockJsonData);

    result.forEach((team) => {
      const transfersNeeded = team.transfers_needed;
      const expectedPenalty =
        Math.max(0, transfersNeeded - mockCurrentTeam.freeTransfers) * 10;
      expect(team.penalty).toBe(expectedPenalty);
    });
  });

  it('all teams should be within budget', () => {
    const result = calculateBestTeams(mockJsonData);
    const totalBudget =
      mockCurrentTeam.costCapRemaining +
      mockCurrentTeam.drivers.reduce(
        (sum, dr) => sum + mockDrivers[dr].price,
        0
      ) +
      mockCurrentTeam.constructors.reduce(
        (sum, cn) => sum + mockConstructors[cn].price,
        0
      );

    result.forEach((team) => {
      expect(team.total_price).toBeLessThanOrEqual(totalBudget);
    });
  });

  it('teams should be sorted by projected points in descending order', () => {
    const result = calculateBestTeams(mockJsonData);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].projected_points).toBeGreaterThanOrEqual(
        result[i].projected_points
      );
    }
  });

  it('should set penalty to zero for all teams when WILDCARD_CHIP is active', () => {
    const WILDCARD_CHIP = 'WILDCARD';
    const mockCurrentTeamWithFewTransfers = {
      ...mockCurrentTeam,
      freeTransfers: 1,
    };
    const mockJsonDataWithFewTransfers = {
      ...mockJsonData,
      CurrentTeam: mockCurrentTeamWithFewTransfers,
    };
    const result = calculateBestTeams(
      mockJsonDataWithFewTransfers,
      WILDCARD_CHIP
    );
    // All teams should have zero penalty since transfers_needed can't exceed 7 with WILDCARD_CHIP
    result.forEach((team) => {
      expect(team.penalty).toBe(0);
    });
  });

  it('should handle empty drivers and constructors gracefully', () => {
    const emptyJsonData = {
      Drivers: [],
      Constructors: [],
      CurrentTeam: {
        drivers: [],
        constructors: [],
        drsBoost: '',
        freeTransfers: 2,
        costCapRemaining: 100,
      },
    };
    const result = calculateBestTeams(emptyJsonData);
    expect(result).toEqual([]);
  });

  it('should allow teams to exceed budget when LIMITLESS_CHIP is active', () => {
    const LIMITLESS_CHIP = 'LIMITLESS';
    // Lower the budget artificially
    const mockCurrentTeamLowBudget = {
      ...mockCurrentTeam,
      drivers: ['LEC', 'HAM', 'PER', 'SAI', 'NOR'],
      costCapRemaining: 0,
    };
    const mockJsonDataLowBudget = {
      ...mockJsonData,
      CurrentTeam: mockCurrentTeamLowBudget,
    };
    const result = calculateBestTeams(mockJsonDataLowBudget, LIMITLESS_CHIP);

    // All teams should have total_price <= 999 (the LIMITLESS budget)
    result.forEach((team) => {
      expect(team.total_price).toBeLessThanOrEqual(999);
    });

    // At least one team should have total_price greater than the normal budget
    const normalBudget =
      mockCurrentTeamLowBudget.costCapRemaining +
      mockCurrentTeamLowBudget.drivers.reduce(
        (sum, dr) => sum + mockDrivers[dr].price,
        0
      ) +
      mockCurrentTeamLowBudget.constructors.reduce(
        (sum, cn) => sum + mockConstructors[cn].price,
        0
      );
    expect(result.some((team) => team.total_price > normalBudget)).toBe(true);
  });

  it('should set penalty to zero for all teams when LIMITLESS_CHIP is active', () => {
    const LIMITLESS_CHIP = 'LIMITLESS';
    // Lower the budget artificially
    const mockCurrentTeamLowBudget = {
      ...mockCurrentTeam,
      drivers: ['LEC', 'HAM', 'PER', 'SAI', 'NOR'],
      costCapRemaining: 0,
      freeTransfers: 1,
    };
    const mockJsonDataLowBudget = {
      ...mockJsonData,
      CurrentTeam: mockCurrentTeamLowBudget,
    };
    const result = calculateBestTeams(mockJsonDataLowBudget, LIMITLESS_CHIP);

    // All teams should have zero penalty regardless of transfers_needed
    result.forEach((team) => {
      expect(team.penalty).toBe(0);
    });
  });

  it('should set expected_price_change to current team value when LIMITLESS_CHIP is active', () => {
    const LIMITLESS_CHIP = 'LIMITLESS';
    // Setup a team with different expected price changes
    const mockCurrentTeamLowBudget = {
      ...mockCurrentTeam,
      drivers: ['LEC', 'HAM', 'PER', 'SAI', 'NOR'],
      constructors: ['FER', 'MER'],
      costCapRemaining: 0,
    };
    const mockJsonDataLowBudget = {
      ...mockJsonData,
      CurrentTeam: mockCurrentTeamLowBudget,
    };

    // Calculate expected price change for current team
    const expectedDriversChange = mockCurrentTeamLowBudget.drivers.reduce(
      (sum, dr) => sum + mockDrivers[dr].expectedPriceChange,
      0
    );
    const expectedConstructorsChange =
      mockCurrentTeamLowBudget.constructors.reduce(
        (sum, cn) => sum + mockConstructors[cn].expectedPriceChange,
        0
      );
    const expectedTotalChange =
      expectedDriversChange + expectedConstructorsChange;

    const result = calculateBestTeams(mockJsonDataLowBudget, LIMITLESS_CHIP);

    result.forEach((team) => {
      expect(team.expected_price_change).toBeCloseTo(expectedTotalChange);
    });
  });

  it('should contain the extra_drs_driver property when EXTRA_DRS_CHIP is active', () => {
    const EXTRA_DRS_CHIP = 'EXTRA_DRS';
    const mockJsonDataWithExtraDRS = {
      ...mockJsonData,
      CurrentTeam: {
        ...mockCurrentTeam,
        freeTransfers: 2,
        costCapRemaining: 10,
      },
    };
    const result = calculateBestTeams(mockJsonDataWithExtraDRS, EXTRA_DRS_CHIP);
    result.forEach((team) => {
      expect(team).toHaveProperty('extra_drs_driver');
    });
  });

  describe('calculateChangesToTeam', () => {
    it('should correctly identify drivers and constructors to add/remove', () => {
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
        constructors: ['RED', 'FER'],
        drs_driver: 'HAM',
      };

      const result = calculateChangesToTeam(mockJsonData, targetTeam);

      expect(result.driversToAdd).toEqual(['NOR']);
      expect(result.driversToRemove).toEqual(['LEC']);
      expect(result.constructorsToAdd).toEqual(['FER']);
      expect(result.constructorsToRemove).toEqual(['MER']);
      expect(result.newDRS).toBe('HAM');
    });

    it('should return empty arrays when no changes needed', () => {
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
        constructors: ['RED', 'MER'],
        drs_driver: 'VER',
      };

      const result = calculateChangesToTeam(mockJsonData, targetTeam);

      expect(result.driversToAdd).toEqual([]);
      expect(result.driversToRemove).toEqual([]);
      expect(result.constructorsToAdd).toEqual([]);
      expect(result.constructorsToRemove).toEqual([]);
      expect(result.newDRS).toBeUndefined();
    });

    it('calculateChangesToTeam should not activate chip if transfers_needed <= freeTransfers', () => {
      const WILDCARD_CHIP = 'WILDCARD';
      const mockJsonDataWithMoreTransfers = {
        ...mockJsonData,
        CurrentTeam: {
          ...mockCurrentTeam,
          freeTransfers: 3,
        },
      };
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
        constructors: ['RED', 'FER'],
        drs_driver: 'HAM',
        transfers_needed: 2, // less than freeTransfers
      };
      const result = calculateChangesToTeam(
        mockJsonDataWithMoreTransfers,
        targetTeam,
        WILDCARD_CHIP
      );
      expect(result.chipToActivate).toBeUndefined();
    });

    it('calculateChangesToTeam should activate WILDCARD_CHIP if needed', () => {
      const WILDCARD_CHIP = 'WILDCARD';
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
        constructors: ['RED', 'FER'],
        drs_driver: 'HAM',
        transfers_needed: 3, // more than freeTransfers
      };
      const result = calculateChangesToTeam(
        mockJsonData,
        targetTeam,
        WILDCARD_CHIP
      );
      expect(result.chipToActivate).toBe(WILDCARD_CHIP);
    });

    it('calculateChangesToTeam should activate LIMITLESS_CHIP if team price exceeds budget', () => {
      const LIMITLESS_CHIP = 'LIMITLESS';
      const mockJsonDataWithLowBudget = {
        ...mockJsonData,
        CurrentTeam: {
          ...mockCurrentTeam,
          costCapRemaining: 1, // very low budget
        },
      };
      // This team will be over the normal budget
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
        constructors: ['RED', 'MER'],
        drs_driver: 'VER',
        total_price: 200, // much higher than possible
      };
      const result = calculateChangesToTeam(
        mockJsonDataWithLowBudget,
        targetTeam,
        LIMITLESS_CHIP
      );
      expect(result.chipToActivate).toBe(LIMITLESS_CHIP);
    });

    it('calculateChangesToTeam should not activate LIMITLESS_CHIP if team price is within budget', () => {
      const LIMITLESS_CHIP = 'LIMITLESS';
      const mockJsonDataWithinBudget = {
        ...mockJsonData,
        CurrentTeam: {
          ...mockCurrentTeam,
          costCapRemaining: 100,
        },
      };
      // This team will be under the normal budget
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
        constructors: ['RED', 'MER'],
        drs_driver: 'VER',
        total_price: 100,
      };
      const result = calculateChangesToTeam(
        mockJsonDataWithinBudget,
        targetTeam,
        LIMITLESS_CHIP
      );
      expect(result.chipToActivate).toBeUndefined();
    });

    it('calculateChangesToTeam should activate EXTRA_DRS_CHIP if chip is selected', () => {
      const EXTRA_DRS_CHIP = 'EXTRA_DRS';
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
        constructors: ['RED', 'FER'],
        drs_driver: 'HAM',
        extra_drs_driver: 'NOR',
      };
      const result = calculateChangesToTeam(
        mockJsonData,
        targetTeam,
        EXTRA_DRS_CHIP
      );
      expect(result.chipToActivate).toBe(EXTRA_DRS_CHIP);
    });

    it('should correctly calculate deltaPoints and deltaPrice', () => {
      const targetTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'], // NOR replaces LEC
        constructors: ['RED', 'FER'], // FER replaces MER
        drs_driver: 'HAM', // VER was DRS
        projected_points: 160, // Arbitrary, chosen to give a specific delta
        expected_price_change: 0.7, // Arbitrary, chosen to give a specific delta
      };

      const actualCurrentTeamExpectedPoints =
        mockCurrentTeam.drivers.reduce(
          (sum, dr) => sum + mockDrivers[dr].expectedPoints,
          0
        ) +
        mockCurrentTeam.constructors.reduce(
          (sum, cn) => sum + mockConstructors[cn].expectedPoints,
          0
        ) +
        mockDrivers[mockCurrentTeam.drsBoost].expectedPoints; // DRS bonus

      const actualCurrentTeamPriceChange =
        mockCurrentTeam.drivers.reduce(
          (sum, dr) => sum + mockDrivers[dr].expectedPriceChange,
          0
        ) +
        mockCurrentTeam.constructors.reduce(
          (sum, cn) => sum + mockConstructors[cn].expectedPriceChange,
          0
        );
      const result = calculateChangesToTeam(mockJsonData, targetTeam);

      const expectedDeltaPoints =
        targetTeam.projected_points - actualCurrentTeamExpectedPoints;
      const expectedDeltaPrice =
        targetTeam.expected_price_change - actualCurrentTeamPriceChange;

      expect(result.deltaPoints).toBeCloseTo(expectedDeltaPoints);
      expect(result.deltaPrice).toBeCloseTo(expectedDeltaPrice);
    });
  });
});
