jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../adminIdentity', () => ({
  isAdminChatId: jest.fn(),
}));
jest.mock('../../cache', () => ({
  getUserTeamIds: jest.fn(),
  getUserLeagueTeamIds: jest.fn(),
  getDriversForChat: jest.fn(),
  getConstructorsForChat: jest.fn(),
  simulationInfoCache: {},
  sharedKey: 'shared',
}));
jest.mock('../../cores/agentGuideCore', () => ({
  GUIDE_TOPICS: [
    'getting_started',
    'teams',
    'leagues',
    'races',
    'settings',
    'admin',
  ],
  buildAgentGuide: jest.fn((args) => ({ status: 'ok', ...args })),
}));
jest.mock('../../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../cacheBootstrap', () => ({
  ensureCacheReady: jest.fn(),
}));
jest.mock('../identity', () => ({
  getAgentChatId: jest.fn(),
}));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((_name, execute) => execute),
}));

const { isAdminChatId } = require('../../adminIdentity');
const cache = require('../../cache');
const {
  buildAgentGuide,
} = require('../../cores/agentGuideCore');
const { listUserLeagues } = require('../../leagueRegistryService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { getAgentGuideTool, hasEntries } = require('./getAgentGuideTool');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  isAdminChatId.mockReturnValue(false);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  listUserLeagues.mockResolvedValue([{ leagueCode: 'ABC' }]);
  cache.getUserTeamIds.mockReturnValue(['T1', 'T2']);
  cache.getUserLeagueTeamIds.mockReturnValue(['Owner_1']);
  cache.getDriversForChat.mockReturnValue({ VER: {} });
  cache.getConstructorsForChat.mockReturnValue({ MCL: {} });
  cache.simulationInfoCache.shared = { name: 'Round 5' };
});

test('recognizes non-empty projection maps', () => {
  expect(hasEntries({ VER: {} })).toBe(true);
  expect(hasEntries({})).toBe(false);
  expect(hasEntries(null)).toBe(false);
});

test('builds the guide from authenticated user state', async () => {
  await getAgentGuideTool.execute({ topic: 'teams' });

  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(buildAgentGuide).toHaveBeenCalledWith({
    lang: 'he',
    topic: 'teams',
    isAdmin: false,
    teamCount: 2,
    followedTeamCount: 1,
    leagueCount: 1,
    hasSimulationData: true,
    hasProjectionData: true,
  });
});

test('uses the shared admin predicate and never accepts identity args', async () => {
  isAdminChatId.mockReturnValue(true);

  expect(() =>
    getAgentGuideTool.parameters.parse({
      topic: 'admin',
      chatId: 123,
      isAdmin: true,
    }),
  ).not.toThrow();
  await getAgentGuideTool.execute({ topic: 'admin' });

  expect(isAdminChatId).toHaveBeenCalledWith(42);
  expect(buildAgentGuide).toHaveBeenCalledWith(
    expect.objectContaining({ isAdmin: true, topic: 'admin' }),
  );
});
