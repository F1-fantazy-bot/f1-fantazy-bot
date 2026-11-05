jest.mock('../azureStorageService', () => ({ getNextRaceInfoData: jest.fn() }));

const { getNextRaceInfoData } = require('../azureStorageService');
const { nextRaceInfoCache, weatherForecastCache, sharedKey } = require('../cache');
const { refreshNextRaceInfoIfExpired } = require('./nextRaceInfoRefreshService');

const mexico = { circuitId: 'rodriguez', sessions: { race: '2026-11-01T20:00:00Z' } };
const brazil = { circuitId: 'interlagos', sessions: { race: '2026-11-08T17:00:00Z' } };
const expired = new Date('2026-11-01T23:00:00.001Z');

beforeEach(() => {
  jest.resetAllMocks();
  nextRaceInfoCache[sharedKey] = mexico;
  for (const key of Object.keys(weatherForecastCache)) {delete weatherForecastCache[key];}
});

test.each(['2026-11-01T19:00:00Z', '2026-11-01T22:59:59Z', '2026-11-01T23:00:00Z'])(
  'keeps cache at %s without fetching', async (now) => {
    await refreshNextRaceInfoIfExpired({ now: new Date(now) });
    expect(getNextRaceInfoData).not.toHaveBeenCalled();
    expect(nextRaceInfoCache[sharedKey]).toBe(mexico);
  }
);

test('reloads after three hours, clears both weather formats, then uses Brazil cache', async () => {
  getNextRaceInfoData.mockResolvedValue(brazil);
  weatherForecastCache.raceWeather = { temperature: 25 };
  weatherForecastCache.raceHourlyWeather = [{ temperature: 25 }];
  await refreshNextRaceInfoIfExpired({ now: expired });
  expect(nextRaceInfoCache[sharedKey]).toBe(brazil);
  expect(weatherForecastCache).toEqual({});
  await refreshNextRaceInfoIfExpired({ now: expired });
  expect(getNextRaceInfoData).toHaveBeenCalledTimes(1);
});

test('keeps weather when storage still has Mexico and retries the next request', async () => {
  getNextRaceInfoData.mockResolvedValueOnce({ ...mexico }).mockResolvedValueOnce(brazil);
  weatherForecastCache.raceWeather = { temperature: 25 };
  await refreshNextRaceInfoIfExpired({ now: expired });
  expect(weatherForecastCache.raceWeather).toEqual({ temperature: 25 });
  await refreshNextRaceInfoIfExpired({ now: expired });
  expect(getNextRaceInfoData).toHaveBeenCalledTimes(2);
  expect(nextRaceInfoCache[sharedKey]).toBe(brazil);
});

test('shares an in-flight storage read across concurrent requests', async () => {
  let complete;
  getNextRaceInfoData.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const requests = [refreshNextRaceInfoIfExpired({ now: expired }), refreshNextRaceInfoIfExpired({ now: expired })];
  expect(getNextRaceInfoData).toHaveBeenCalledTimes(1);
  complete(brazil);
  await Promise.all(requests);
  expect(nextRaceInfoCache[sharedKey]).toBe(brazil);
});

test.each([new Error('storage unavailable'), null, { sessions: { race: 'invalid' } }])(
  'preserves cache on a failed or invalid refresh and retries', async (failure) => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      if (failure instanceof Error) {getNextRaceInfoData.mockRejectedValueOnce(failure);}
      else {getNextRaceInfoData.mockResolvedValueOnce(failure);}
      getNextRaceInfoData.mockResolvedValueOnce(brazil);
      weatherForecastCache.raceWeather = { temperature: 25 };
      await refreshNextRaceInfoIfExpired({ now: expired });
      expect(nextRaceInfoCache[sharedKey]).toBe(mexico);
      expect(weatherForecastCache.raceWeather).toEqual({ temperature: 25 });
      expect(log).toHaveBeenCalled();
      await refreshNextRaceInfoIfExpired({ now: expired });
      expect(nextRaceInfoCache[sharedKey]).toBe(brazil);
    } finally { log.mockRestore(); }
  }
);

test.each([undefined, { sessions: {} }])('leaves unavailable race data to cache initialization', async (cached) => {
  nextRaceInfoCache[sharedKey] = cached;
  await refreshNextRaceInfoIfExpired({ now: expired });
  expect(getNextRaceInfoData).not.toHaveBeenCalled();
});
