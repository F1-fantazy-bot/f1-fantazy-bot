const {
  buildFreshness,
  buildProjectionData,
  buildSimulationStatus,
} = require('./simulationStatusCore');

const NOW = Date.parse('2026-09-02T12:00:00.000Z');

describe('simulationStatusCore', () => {
  test('returns safe source metadata, race-relevant status, and counts', () => {
    const result = buildSimulationStatus({
      simulationInfo: {
        name: 'Italian GP projection',
        lastUpdate: '2026-09-02T11:30:00.000Z',
        privateBlobPath: 'https://storage.example/private?sig=secret',
      },
      drivers: { VER: { private: 'driver payload' }, NOR: {} },
      constructors: { MCL: {} },
      pricesMetadata: { matchdayId: 16, storagePath: 'private' },
      nextRaceInfo: {
        raceName: 'Italian Grand Prix',
        circuitName: 'Autodromo Nazionale Monza',
      },
      now: NOW,
    });

    expect(result).toEqual({
      status: 'ok',
      source: { kind: 'simulation', name: 'Italian GP projection' },
      matchday: 16,
      lastUpdate: '2026-09-02T11:30:00.000Z',
      freshness: {
        status: 'fresh',
        updatedAt: '2026-09-02T11:30:00.000Z',
      },
      available: { drivers: 2, constructors: 1 },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('payload');
  });

  test('returns not_loaded and an unknown race status when simulation metadata is absent', () => {
    expect(
      buildSimulationStatus({
        drivers: { VER: {} },
        constructors: { MCL: {} },
        now: NOW,
      }),
    ).toEqual({
      status: 'not_loaded',
      source: null,
      matchday: null,
      lastUpdate: null,
      freshness: { status: 'unknown', updatedAt: null },
      available: { drivers: 1, constructors: 1 },
    });
  });

  test('classifies only a next-race simulation as current', () => {
    expect(buildFreshness({
      simulationName: 'Monza. Pre-Q.',
      nextRaceInfo: {
        raceName: 'Italian Grand Prix',
        circuitName: 'Autodromo Nazionale Monza',
      },
      lastUpdate: 'not-a-date',
    })).toEqual({ status: 'fresh', updatedAt: null });

    expect(buildFreshness({
      simulationName: 'Zandvoort. Post-SQ.',
      nextRaceInfo: {
        raceName: 'Italian Grand Prix',
        circuitName: 'Autodromo Nazionale Monza',
      },
      lastUpdate: '2026-08-22T05:41:00.000Z',
    })).toEqual({
      status: 'stale',
      updatedAt: '2026-08-22T05:41:00.000Z',
    });

    expect(buildFreshness({ simulationName: 'Monza. Pre-Q.' })).toEqual({
      status: 'unknown',
      updatedAt: null,
    });
  });

  test('uses a simulation-supplied matchday before price metadata', () => {
    expect(
      buildSimulationStatus({
        simulationInfo: { name: 'Projection', matchdayId: 9 },
        pricesMetadata: { matchdayId: 8 },
        now: NOW,
      }).matchday,
    ).toBe(9);
  });

  test('uses matchdays over names when next-race data supplies both', () => {
    expect(
      buildSimulationStatus({
        simulationInfo: { name: 'Italian GP projection', matchdayId: 9 },
        nextRaceInfo: {
          matchdayId: 10,
          raceName: 'Italian Grand Prix',
          circuitName: 'Monza',
        },
      }).freshness.status,
    ).toBe('stale');
  });

  test('does not mistake an F1 round for a Fantasy matchday', () => {
    const status = buildSimulationStatus({
      simulationInfo: { name: 'Zandvoort. Post-SQ.' },
      pricesMetadata: { matchdayId: 13 },
      nextRaceInfo: {
        raceName: 'Italian Grand Prix',
        circuitName: 'Autodromo Nazionale di Monza',
        round: 13,
      },
      now: NOW,
    });

    expect(status.freshness.status).toBe('stale');
  });

  test('maps projection caches to bounded, sorted allowlisted rows', () => {
    const result = buildProjectionData({
      drivers: {
        VER: {
          DR: 'VER',
          price: 30.567,
          expectedPoints: 20.126,
          expectedPriceChange: 0.234,
          storagePath: 'private/blob',
        },
        NOR: { DR: 'NOR', price: 29, expected_points: 30, expected_price_change: -0.1 },
      },
      constructors: {
        MCL: { CN: 'MCL', price: 35, expectedPoints: 40, expectedPriceChange: 0 },
      },
    });

    expect(result).toEqual({
      drivers: [
        { code: 'NOR', price: 29, expectedPoints: 30, expectedPriceChange: -0.1 },
        { code: 'VER', price: 30.57, expectedPoints: 20.13, expectedPriceChange: 0.23 },
      ],
      constructors: [
        { code: 'MCL', price: 35, expectedPoints: 40, expectedPriceChange: 0 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
