jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../cache', () => ({
  driversCache: {},
  constructorsCache: {},
  simulationInfoCache: {},
  nextRaceInfoCache: {},
  pricesCache: { metadata: null },
  sharedKey: 'shared',
}));
jest.mock('../../cores/simulationStatusCore', () => ({
  buildSimulationStatus: jest.fn(),
  buildProjectionData: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../../services/simulationRaceStatusService', () => ({
  getUpcomingRaceIdentity: jest.fn(),
}));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn() }));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((name, execute) => {
    execute.wrappedToolName = name;

    return execute;
  }),
}));

const {
  driversCache,
  constructorsCache,
  simulationInfoCache,
  nextRaceInfoCache,
  pricesCache,
  sharedKey,
} = require('../../cache');
const {
  buildSimulationStatus,
  buildProjectionData,
} = require('../../cores/simulationStatusCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getUpcomingRaceIdentity,
} = require('../../services/simulationRaceStatusService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { getSimulationStatusTool } = require('./getSimulationStatusTool');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  getUpcomingRaceIdentity.mockResolvedValue({ raceName: 'Italian Grand Prix' });
  simulationInfoCache[sharedKey] = { name: 'Monza' };
  driversCache[sharedKey] = { VER: {} };
  constructorsCache[sharedKey] = { MCL: {} };
  pricesCache.metadata = { matchdayId: 16 };
  nextRaceInfoCache[sharedKey] = { raceName: 'Italian Grand Prix' };
  buildSimulationStatus.mockReturnValue({
    status: 'ok',
    source: { kind: 'simulation', name: 'Monza' },
    matchday: 16,
    lastUpdate: null,
    freshness: { status: 'unknown', updatedAt: null },
    available: { drivers: 1, constructors: 1 },
  });
  buildProjectionData.mockReturnValue({
    drivers: [{ code: 'VER', price: 30, expectedPoints: 25, expectedPriceChange: 0.2 }],
    constructors: [{ code: 'MCL', price: 20, expectedPoints: 30, expectedPriceChange: 0 }],
  });
});

test('is registered through wrapToolExecute', () => {
  expect(getSimulationStatusTool.execute.wrappedToolName).toBe(
    'get_simulation_status',
  );
});

test('returns shared safe simulation status in the saved language', async () => {
  await expect(getSimulationStatusTool.execute({})).resolves.toEqual({
    status: 'ok',
    source: { kind: 'simulation', name: 'Monza' },
    matchday: 16,
    freshness: { status: 'unknown', updatedAtLocal: null },
    available: { drivers: 1, constructors: 1 },
    projections: {
      drivers: [{ code: 'VER', price: 30, expectedPoints: 25, expectedPriceChange: 0.2 }],
      constructors: [{ code: 'MCL', price: 20, expectedPoints: 30, expectedPriceChange: 0 }],
    },
    lang: 'he',
  });

  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
  expect(getUpcomingRaceIdentity).toHaveBeenCalledWith({
    cachedNextRaceInfo: { raceName: 'Italian Grand Prix' },
  });
  expect(buildSimulationStatus).toHaveBeenCalledWith({
    simulationInfo: { name: 'Monza' },
    drivers: { VER: {} },
    constructors: { MCL: {} },
    pricesMetadata: { matchdayId: 16 },
    nextRaceInfo: { raceName: 'Italian Grand Prix' },
  });
  expect(buildProjectionData).toHaveBeenCalledWith({
    drivers: { VER: {} },
    constructors: { MCL: {} },
  });
});
