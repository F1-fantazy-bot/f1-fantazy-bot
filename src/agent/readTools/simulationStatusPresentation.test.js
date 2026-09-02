const {
  localizeDataStatus,
  localizeSimulationStatus,
} = require('./simulationStatusPresentation');

describe('simulationStatusPresentation', () => {
  test('replaces an ISO timestamp with a saved-language Jerusalem display time', () => {
    const result = localizeSimulationStatus(
      {
        status: 'ok',
        lastUpdate: '2026-08-22T05:41:00.000Z',
        freshness: {
          status: 'stale',
          updatedAt: '2026-08-22T05:41:00.000Z',
        },
      },
      'en',
    );

    expect(result).toEqual({
      status: 'ok',
      freshness: {
        status: 'stale',
        updatedAtLocal: expect.stringContaining('08:41'),
      },
    });
    expect(JSON.stringify(result)).not.toContain('2026-08-22T05:41:00.000Z');
  });

  test('localizes nested data-status freshness without changing the rest', () => {
    const result = localizeDataStatus(
      {
        status: 'ok',
        cache: { teams: [] },
        simulation: {
          status: 'ok',
          freshness: {
            status: 'fresh',
            updatedAt: '2026-08-22T05:41:00.000Z',
          },
        },
      },
      'he',
    );

    expect(result.cache).toEqual({ teams: [] });
    expect(result.simulation.freshness).toEqual({
      status: 'fresh',
      updatedAtLocal: expect.stringContaining('8:41'),
    });
  });
});
