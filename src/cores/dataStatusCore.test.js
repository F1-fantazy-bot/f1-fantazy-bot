const { buildDataStatus } = require('./dataStatusCore');

const NOW = Date.parse('2026-09-02T12:00:00.000Z');

describe('dataStatusCore', () => {
  test('builds an agent-safe complete diagnostic summary', () => {
    const result = buildDataStatus({
      simulationInfo: {
        name: 'Monza projection',
        lastUpdate: '2026-09-02T11:00:00.000Z',
        storagePath: 'private/blob.json',
      },
      sharedDrivers: { VER: {}, NOR: {} },
      sharedConstructors: { MCL: {}, FER: {} },
      drivers: { VER: {}, NOR: {} },
      constructors: { MCL: {}, FER: {} },
      pricesMetadata: { matchdayId: 16 },
      nextRaceInfo: { raceName: 'Monza Grand Prix', circuitName: 'Monza' },
      teams: {
        T1: { teamName: 'Doron Racing', rawRoster: ['private'] },
      },
      selectedTeamId: 'T1',
      chipsByTeam: { T1: 'LIMITLESS' },
      projectionSource: 'simulation',
      printableCache: '```json private ```',
      now: NOW,
    });

    expect(result).toEqual({
      status: 'ok',
      source: 'simulation',
      simulation: {
        status: 'ok',
        name: 'Monza projection',
        matchday: 16,
        freshness: {
          status: 'fresh',
          updatedAt: '2026-09-02T11:00:00.000Z',
        },
      },
      projections: { drivers: 2, constructors: 2, available: true },
      teams: {
        ownedCount: 1,
        selected: 'Doron Racing',
        hasSelectedTeam: true,
      },
      cache: {
        projections: { drivers: [{ code: 'NOR', price: null, expectedPoints: null, expectedPriceChange: null }, { code: 'VER', price: null, expectedPoints: null, expectedPriceChange: null }], constructors: [{ code: 'FER', price: null, expectedPoints: null, expectedPriceChange: null }, { code: 'MCL', price: null, expectedPoints: null, expectedPriceChange: null }] },
        teams: [{ teamId: 'T1', teamName: 'Doron Racing', isSelected: true, chip: 'LIMITLESS', drivers: [], constructors: [], boost: null, freeTransfers: null, costCapRemaining: null, budgetChangePointsPerMillion: 0 }],
      },
      missingPrerequisites: [],
      nextActions: [],
      printableCacheAvailable: true,
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('rawRoster');
  });

  test('identifies missing simulation, projections, teams, and next actions', () => {
    expect(buildDataStatus({ now: NOW })).toEqual({
      status: 'incomplete',
      source: 'unavailable',
      simulation: {
        status: 'not_loaded',
        name: null,
        matchday: null,
        freshness: { status: 'unknown', updatedAt: null },
      },
      projections: { drivers: 0, constructors: 0, available: false },
      teams: { ownedCount: 0, selected: null, hasSelectedTeam: false },
      cache: { projections: { drivers: [], constructors: [] }, teams: [] },
      missingPrerequisites: [
        'simulation',
        'drivers',
        'constructors',
        'owned_team',
      ],
      nextActions: ['refresh_simulation', 'refresh_projections', 'add_team'],
      printableCacheAvailable: false,
    });
  });

  test('asks for a selection when owned teams exist but none is active', () => {
    const result = buildDataStatus({
      simulationInfo: { name: 'Projection' },
      sharedDrivers: { VER: {} },
      sharedConstructors: { MCL: {} },
      drivers: { VER: {} },
      constructors: { MCL: {} },
      teams: { T1: { teamName: 'One' }, T2: { teamName: 'Two' } },
      selectedTeamId: 'MISSING',
      now: NOW,
    });

    expect(result.status).toBe('incomplete');
    expect(result.missingPrerequisites).toEqual(['selected_team']);
    expect(result.nextActions).toEqual(['select_team']);
  });

  test('reports personal_or_mixed when a user cache overrides simulation data', () => {
    const sharedDrivers = { VER: {} };
    const result = buildDataStatus({
      simulationInfo: { name: 'Projection' },
      sharedDrivers,
      sharedConstructors: { MCL: {} },
      drivers: { ALO: {} },
      constructors: { MCL: {} },
      projectionSource: 'personal_or_mixed',
      teams: { T1: {} },
      selectedTeamId: 'T1',
      now: NOW,
    });

    expect(result.source).toBe('personal_or_mixed');
  });

  test('returns only a readable allowlist of cached roster fields', () => {
    const result = buildDataStatus({
      simulationInfo: { name: 'Projection' },
      sharedDrivers: { VER: {} },
      sharedConstructors: { MCL: {} },
      drivers: { VER: { DR: 'VER', price: 30, expectedPoints: 25 } },
      constructors: { MCL: { CN: 'MCL', price: 20, expectedPoints: 30 } },
      teams: {
        T1: {
          teamName: 'Kilzid',
          drivers: ['VER', 'NOR'],
          constructors: ['MCL'],
          boost: 'VER',
          freeTransfers: 2,
          costCapRemaining: 0.5,
          credentials: 'private',
          rawRoster: [{ token: 'secret' }],
        },
      },
      chipsByTeam: { T1: 'EXTRA_BOOST' },
      ppmByTeam: { T1: 1.65 },
      selectedTeamId: 'T1',
      now: NOW,
    });

    expect(result.cache).toEqual({
      projections: {
        drivers: [{ code: 'VER', price: 30, expectedPoints: 25, expectedPriceChange: null }],
        constructors: [{ code: 'MCL', price: 20, expectedPoints: 30, expectedPriceChange: null }],
      },
      teams: [{
        teamId: 'T1',
        teamName: 'Kilzid',
        isSelected: true,
        chip: 'EXTRA_BOOST',
        drivers: ['VER', 'NOR'],
        constructors: ['MCL'],
        boost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 0.5,
        budgetChangePointsPerMillion: 1.65,
      }],
    });
    expect(JSON.stringify(result.cache)).not.toContain('private');
    expect(JSON.stringify(result.cache)).not.toContain('secret');
  });

  test('falls back to the pure-points preset for an invalid saved value', () => {
    const result = buildDataStatus({
      teams: { T1: { teamName: 'Kilzid' } },
      ppmByTeam: { T1: 9.99 },
    });

    expect(result.cache.teams[0].budgetChangePointsPerMillion).toBe(0);
  });
});
