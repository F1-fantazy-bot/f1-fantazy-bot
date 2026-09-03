const {
  SHARED_SIMULATION_SOURCE,
  createSimulationRefreshService,
} = require('./simulationRefreshService');

const SIMULATION = {
  SimulationName: 'Monza. Pre-Q.',
  SimulationLastUpdate: '2026-09-03T08:15:00.000Z',
  Drivers: [{ DR: 'VER', price: 30.5 }, { DR: 'NOR', price: 25.1 }],
  Constructors: [{ CN: 'MCL', price: 29.5 }],
};

function createHarness(overrides = {}) {
  const cache = {
    driversCache: {},
    constructorsCache: {},
    simulationInfoCache: {},
    sharedKey: 'simulation',
    setPrices: jest.fn(),
    clearPrices: jest.fn(),
  };
  const dependencies = {
    fetchFantasyData: jest.fn().mockResolvedValue(SIMULATION),
    fetchPricesData: jest.fn().mockResolvedValue({
      fetchedAt: '2026-09-03T08:14:00.000Z',
      matchdayId: 14,
      drivers: [],
      constructors: [],
    }),
    validateFantasyData: jest.fn().mockResolvedValue(true),
    applyCanonicalPrices: jest.fn(({ drivers, constructors }) => ({
      drivers: {
        ...drivers,
        VER: { ...drivers.VER, price: 31.2 },
      },
      constructors,
      priceMaps: { drivers: { VER: 31.2 }, constructors: {} },
      report: { drivers: {}, constructors: {} },
    })),
    cache,
    driverCodes: new Set(['VER', 'NOR']),
    constructorCodes: new Set(['MCL']),
    now: () => new Date('2026-09-03T08:16:00.000Z'),
    ...overrides,
  };

  return {
    cache,
    dependencies,
    service: createSimulationRefreshService(dependencies),
  };
}

describe('simulationRefreshService', () => {
  test('publishes the shared simulation and returns a safe refresh summary', async () => {
    const { service, cache } = createHarness();
    const events = {
      info: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined),
      admins: jest.fn().mockResolvedValue(undefined),
    };

    await expect(service.refresh({ events })).resolves.toEqual({
      status: 'ok',
      source: SHARED_SIMULATION_SOURCE,
      fetchedAt: '2026-09-03T08:16:00.000Z',
      matchday: 14,
      counts: { drivers: 2, constructors: 1 },
      prices: { source: 'canonical_prices' },
    });
    expect(cache.simulationInfoCache.simulation).toEqual({
      name: 'Monza. Pre-Q.',
      lastUpdate: '2026-09-03T08:15:00.000Z',
    });
    expect(cache.driversCache.simulation.VER.price).toBe(31.2);
    expect(cache.setPrices).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          fetchedAt: '2026-09-03T08:14:00.000Z',
          matchdayId: 14,
        },
      }),
    );
  });

  test('serializes concurrent refreshes in the current process', async () => {
    let resolveFantasyData;
    const blockedFantasyData = new Promise((resolve) => {
      resolveFantasyData = resolve;
    });
    const { service, dependencies } = createHarness({
      fetchFantasyData: jest.fn(() => blockedFantasyData),
    });

    const first = service.refresh();
    const second = service.refresh();
    expect(second).toBe(first);
    expect(dependencies.fetchFantasyData).toHaveBeenCalledTimes(1);

    resolveFantasyData(SIMULATION);
    await expect(first).resolves.toMatchObject({ status: 'ok' });
  });

  test('falls back to simulation prices without failing a valid refresh', async () => {
    const { service, cache } = createHarness({
      fetchPricesData: jest.fn().mockRejectedValue(new Error('prices absent')),
    });
    const events = { error: jest.fn().mockResolvedValue(undefined) };

    await expect(service.refresh({ events })).resolves.toMatchObject({
      status: 'ok',
      matchday: null,
      prices: { source: 'simulation' },
      counts: { drivers: 2, constructors: 1 },
    });
    expect(cache.clearPrices).toHaveBeenCalledTimes(1);
    expect(events.error).toHaveBeenCalledWith(
      expect.stringContaining('falling back to simulation prices: prices absent'),
    );
  });

  test('resets the process lock after a failed refresh so a later retry can run', async () => {
    const validateFantasyData = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { service, dependencies } = createHarness({ validateFantasyData });

    await expect(service.refresh()).rejects.toThrow(
      'Fantasy data validation failed',
    );
    await expect(service.refresh()).resolves.toMatchObject({ status: 'ok' });
    expect(dependencies.fetchFantasyData).toHaveBeenCalledTimes(2);
  });

  test('reports unexpected mapping codes through the injected operational events', async () => {
    const { service } = createHarness({
      driverCodes: new Set(['VER']),
      constructorCodes: new Set(),
    });
    const events = {
      error: jest.fn().mockResolvedValue(undefined),
      admins: jest.fn().mockResolvedValue(undefined),
    };

    await service.refresh({ events });

    expect(events.error).toHaveBeenCalledWith(
      expect.stringContaining('Drivers not found in mapping: NOR'),
    );
    expect(events.admins).toHaveBeenCalledWith(
      expect.stringContaining('Constructors not found in mapping: MCL'),
    );
  });
});
