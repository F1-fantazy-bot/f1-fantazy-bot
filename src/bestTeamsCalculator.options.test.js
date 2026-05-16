const { calculateBestTeams } = require('./bestTeamsCalculator');

describe('calculateBestTeams options', () => {
  // Six drivers, three constructors — yields C(6,5)*C(3,2) = 6*3 = 18 team
  // candidates, enough to exercise filters + ranking without being slow.
  const mockDrivers = {
    VER: { DR: 'VER', price: 30, expectedPoints: 50, expectedPriceChange: 0.2 },
    HAM: { DR: 'HAM', price: 28, expectedPoints: 40, expectedPriceChange: 0.1 },
    PER: { DR: 'PER', price: 25, expectedPoints: 30, expectedPriceChange: -0.1 },
    SAI: { DR: 'SAI', price: 23, expectedPoints: 25, expectedPriceChange: 0.3 },
    LEC: { DR: 'LEC', price: 24, expectedPoints: 35, expectedPriceChange: 0.1 },
    ALO: { DR: 'ALO', price: 20, expectedPoints: 15, expectedPriceChange: 0 },
  };
  const mockConstructors = {
    RED: { CN: 'RED', price: 35, expectedPoints: 45, expectedPriceChange: 0.5 },
    MER: { CN: 'MER', price: 32, expectedPoints: 35, expectedPriceChange: 0.2 },
    FER: { CN: 'FER', price: 30, expectedPoints: 30, expectedPriceChange: -0.1 },
  };
  const mockCurrentTeam = {
    drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
    constructors: ['RED', 'MER'],
    boost: 'VER',
    freeTransfers: 2,
    costCapRemaining: 100,
  };
  const mockJsonData = {
    Drivers: mockDrivers,
    Constructors: mockConstructors,
    CurrentTeam: mockCurrentTeam,
  };

  it('mustIncludeDrivers filters to only teams with required drivers', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      mustIncludeDrivers: ['VER'],
    });
    expect(result.length).toBeGreaterThan(0);
    for (const team of result) {
      expect(team.drivers).toContain('VER');
    }
  });

  it('mustExcludeDrivers filters out teams with banned drivers', () => {
    const withAlo = calculateBestTeams(mockJsonData, undefined, 0, 0, {});
    expect(withAlo.some((t) => t.drivers.includes('ALO'))).toBe(true);

    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      mustExcludeDrivers: ['ALO'],
    });
    expect(result.length).toBeGreaterThan(0);
    for (const team of result) {
      expect(team.drivers).not.toContain('ALO');
    }
  });

  it('combines include + exclude filters', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      mustIncludeDrivers: ['VER'],
      mustExcludeDrivers: ['ALO'],
    });
    for (const team of result) {
      expect(team.drivers).toContain('VER');
      expect(team.drivers).not.toContain('ALO');
    }
  });

  it('mustIncludeConstructors filters to teams with required constructor', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      mustIncludeConstructors: ['FER'],
    });
    for (const team of result) {
      expect(team.constructors).toContain('FER');
    }
  });

  it('mustExcludeConstructors filters out teams with banned constructor', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      mustExcludeConstructors: ['RED'],
    });
    for (const team of result) {
      expect(team.constructors).not.toContain('RED');
    }
  });

  it('rankBy: "points" sorts strictly by projected_points desc', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      rankBy: 'points',
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].projected_points).toBeGreaterThanOrEqual(
        result[i].projected_points,
      );
    }
  });

  it('rankBy: "points_per_million" sorts by points/price', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      rankBy: 'points_per_million',
    });
    expect(result.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1].projected_points / result[i - 1].total_price;
      const curr = result[i].projected_points / result[i].total_price;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('rankBy: "budget_adjusted" sorts by budget_adjusted_points', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 1.5, 10, {
      rankBy: 'budget_adjusted',
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].budget_adjusted_points).toBeGreaterThanOrEqual(
        result[i].budget_adjusted_points,
      );
    }
  });

  it('resultCount caps the returned list', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      resultCount: 3,
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('empty options object preserves legacy behaviour', () => {
    const legacy = calculateBestTeams(mockJsonData, undefined, 0, 0);
    const sameViaOptions = calculateBestTeams(mockJsonData, undefined, 0, 0, {});
    expect(sameViaOptions).toEqual(legacy);
  });

  it('returns empty list when filter rules out all teams', () => {
    const result = calculateBestTeams(mockJsonData, undefined, 0, 0, {
      // Impossible: require both VER and force-exclude RED+MER+FER (only
      // constructors that exist) — no constructor combos left.
      mustExcludeConstructors: ['RED', 'MER', 'FER'],
    });
    expect(result).toEqual([]);
  });
});
