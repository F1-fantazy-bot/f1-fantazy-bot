const { nextRaceInfoCache, weatherForecastCache, sharedKey } = require('../cache');
const { getNextRaceInfoData } = require('../azureStorageService');

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
let pendingRefresh = null;

// Each worker keeps its cache until three hours after the cached race start.
// If storage still has the old race, the next request will try again.
async function refreshNextRaceInfoIfExpired({ now = Date.now() } = {}) {
  const cached = nextRaceInfoCache[sharedKey];
  const raceStart = Date.parse(cached?.sessions?.race);
  if (!Number.isFinite(raceStart) || Number(now) <= raceStart + THREE_HOURS_MS) {
    return;
  }

  if (!pendingRefresh) {
    pendingRefresh = (async () => {
      const refreshed = await getNextRaceInfoData();
      if (!refreshed || !Number.isFinite(Date.parse(refreshed.sessions?.race))) {
        throw new Error('Refreshed next race info has no valid race timestamp');
      }

      if (refreshed.sessions.race !== cached.sessions.race ||
          refreshed.circuitId !== cached.circuitId) {
        for (const key of Object.keys(weatherForecastCache)) {
          delete weatherForecastCache[key];
        }
      }
      nextRaceInfoCache[sharedKey] = refreshed;
    })().catch((error) => {
      // Keep the existing snapshot on transient storage failures; retry later.
      console.error('Failed to refresh next race info:', error.message);
    }).finally(() => {
      pendingRefresh = null;
    });
  }

  await pendingRefresh;
}

module.exports = { refreshNextRaceInfoIfExpired };
