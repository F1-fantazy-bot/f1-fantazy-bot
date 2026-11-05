jest.mock('../cacheInitializer', () => ({ initializeCaches: jest.fn() }));
jest.mock('./notifierBot', () => ({ getNotifierBot: jest.fn(() => ({})) }));
jest.mock('../services/nextRaceInfoRefreshService', () => ({ refreshNextRaceInfoIfExpired: jest.fn() }));
const { initializeCaches } = require('../cacheInitializer');
const { refreshNextRaceInfoIfExpired } = require('../services/nextRaceInfoRefreshService');
const { ensureCacheReady, resetCacheReadyForTests } = require('./cacheBootstrap');

test('checks race freshness on every agent access while initializing once', async () => {
  resetCacheReadyForTests();
  initializeCaches.mockResolvedValue();
  await ensureCacheReady();
  await ensureCacheReady();
  expect(initializeCaches).toHaveBeenCalledTimes(1);
  expect(refreshNextRaceInfoIfExpired).toHaveBeenCalledTimes(2);
});
