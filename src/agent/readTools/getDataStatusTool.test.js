jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../cache', () => ({
  driversCache: {},
  constructorsCache: {},
  currentTeamCache: {},
  selectedChipCache: {},
  simulationInfoCache: {},
  nextRaceInfoCache: {},
  pricesCache: { metadata: null },
  sharedKey: 'shared',
  getSelectedTeam: jest.fn(),
  getBestTeamBudgetChangePointsPerMillion: jest.fn(),
  getDriversForChat: jest.fn(),
  getConstructorsForChat: jest.fn(),
}));
jest.mock('../../cores/dataStatusCore', () => ({
  buildDataStatus: jest.fn(),
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
  currentTeamCache,
  selectedChipCache,
  simulationInfoCache,
  nextRaceInfoCache,
  pricesCache,
  sharedKey,
  getSelectedTeam,
  getBestTeamBudgetChangePointsPerMillion,
  getDriversForChat,
  getConstructorsForChat,
} = require('../../cache');
const { buildDataStatus } = require('../../cores/dataStatusCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getUpcomingRaceIdentity,
} = require('../../services/simulationRaceStatusService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { getDataStatusTool } = require('./getDataStatusTool');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en' });
  getUpcomingRaceIdentity.mockResolvedValue({ raceName: 'Italian Grand Prix' });
  simulationInfoCache[sharedKey] = { name: 'Monza' };
  driversCache[sharedKey] = { VER: {} };
  constructorsCache[sharedKey] = { MCL: {} };
  currentTeamCache[42] = { T1: { teamName: 'Doron Racing' } };
  selectedChipCache[42] = { T1: 'LIMITLESS' };
  pricesCache.metadata = { matchdayId: 16 };
  nextRaceInfoCache[sharedKey] = { raceName: 'Italian Grand Prix' };
  getSelectedTeam.mockReturnValue('T1');
  getBestTeamBudgetChangePointsPerMillion.mockReturnValue(1.3);
  getDriversForChat.mockReturnValue({ VER: {} });
  getConstructorsForChat.mockReturnValue({ MCL: {} });
  buildDataStatus.mockReturnValue({
    status: 'ok',
    source: 'simulation',
    simulation: {
      status: 'ok',
      name: 'Monza',
      freshness: { status: 'unknown', updatedAt: null },
    },
    projections: { drivers: 1, constructors: 1, available: true },
    teams: { ownedCount: 1, selected: 'Doron Racing', hasSelectedTeam: true },
    missingPrerequisites: [],
    nextActions: [],
    printableCacheAvailable: false,
    cache: { projections: { drivers: [], constructors: [] }, teams: [] },
  });
});

test('is registered through wrapToolExecute', () => {
  expect(getDataStatusTool.execute.wrappedToolName).toBe('get_data_status');
});

test('returns the safe data diagnostic and saved language', async () => {
  await expect(getDataStatusTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    source: 'simulation',
    lang: 'en',
  });

  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
  expect(getUpcomingRaceIdentity).toHaveBeenCalledWith({
    cachedNextRaceInfo: { raceName: 'Italian Grand Prix' },
  });
  expect(getBestTeamBudgetChangePointsPerMillion).toHaveBeenCalledWith(42, 'T1');
  expect(buildDataStatus).toHaveBeenCalledWith({
    simulationInfo: { name: 'Monza' },
    sharedDrivers: { VER: {} },
    sharedConstructors: { MCL: {} },
    drivers: { VER: {} },
    constructors: { MCL: {} },
    pricesMetadata: { matchdayId: 16 },
    nextRaceInfo: { raceName: 'Italian Grand Prix' },
    teams: { T1: { teamName: 'Doron Racing' } },
    selectedTeamId: 'T1',
    chipsByTeam: { T1: 'LIMITLESS' },
    ppmByTeam: { T1: 1.3 },
    projectionSource: 'simulation',
  });
});

test('marks personal data when either per-user projection cache is present', async () => {
  driversCache[42] = { ALO: {} };

  await getDataStatusTool.execute({});

  expect(buildDataStatus).toHaveBeenCalledWith(
    expect.objectContaining({ projectionSource: 'personal_or_mixed' }),
  );
});
