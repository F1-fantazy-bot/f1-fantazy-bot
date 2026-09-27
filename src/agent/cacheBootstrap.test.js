jest.mock('../cacheInitializer', () => ({
  initializeCaches: jest.fn().mockResolvedValue(undefined),
  refreshLeagueSourcedTeams: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../cache', () => ({
  currentTeamCache: {},
  isLeagueTeamId: (teamId) => teamId.includes('_'),
}));
jest.mock('./notifierBot', () => ({ getNotifierBot: () => ({}) }));

const { currentTeamCache } = require('../cache');
const {
  initializeCaches,
  refreshLeagueSourcedTeams,
} = require('../cacheInitializer');
const {
  ensureCurrentUserIdentity,
  resetCacheReadyForTests,
} = require('./cacheBootstrap');

beforeEach(() => {
  resetCacheReadyForTests();
  jest.clearAllMocks();
  Object.keys(currentTeamCache).forEach((key) => delete currentTeamCache[key]);
});

test('warm test agent retries legacy migration after the scraper uploads account IDs', async () => {
  currentTeamCache[42] = { 'Doron-Kilzi_1': { teamName: 'Kilzid' } };
  await ensureCurrentUserIdentity(42);

  // The first attempt saw the old scraper blob and could not resolve it.
  expect(initializeCaches).toHaveBeenCalledTimes(1);
  expect(refreshLeagueSourcedTeams).toHaveBeenCalledTimes(1);

  // The next request sees the updated blob and migrates the legacy ID.
  refreshLeagueSourcedTeams.mockImplementationOnce(async () => {
    delete currentTeamCache[42]['Doron-Kilzi_1'];
    currentTeamCache[42]['Doron-Kilzi_1_a84f12c98d31'] = { teamName: 'Kilzid' };
  });
  await ensureCurrentUserIdentity(42);
  await ensureCurrentUserIdentity(42);

  expect(initializeCaches).toHaveBeenCalledTimes(1);
  expect(refreshLeagueSourcedTeams).toHaveBeenCalledTimes(2);
  expect(refreshLeagueSourcedTeams).toHaveBeenCalledWith({}, '42');
});

test('canonical teams and screenshot teams do not trigger another migration', async () => {
  currentTeamCache[42] = {
    T1: {},
    'Doron-Kilzi_1_a84f12c98d31': {},
  };
  await ensureCurrentUserIdentity(42);
  expect(refreshLeagueSourcedTeams).not.toHaveBeenCalled();
});
