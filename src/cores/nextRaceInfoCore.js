const {
  nextRaceInfoCache,
  sharedKey,
  weatherForecastCache,
} = require('../cache');
const { getWeatherForecast } = require('../utils/weatherApi');

// Reads cached next-race info + opportunistically populates the
// race/qualifying (and sprint, when applicable) weather snapshot. Both
// surfaces (Telegram adapter, agent tool) consume this. The Telegram
// adapter wires `onFetch` / `onError` to bot-side logging helpers; the
// agent path omits them.
//
// Cache-population logic mirrors the original handler byte-for-byte so
// the existing handler test stays green: the "is cached" check uses
// `Object.keys(weatherForecastCache).length > 0` (loose, matches prior
// behavior), and on fetch we populate the same `qualifyingWeather` /
// `raceWeather` (+ sprint variants) keys.
async function getNextRaceInfo({ onFetch, onError } = {}) {
  const nextRaceInfo = nextRaceInfoCache[sharedKey];

  if (!nextRaceInfo) {
    return { status: 'unavailable' };
  }

  const isSprintWeekend = nextRaceInfo.weekendFormat === 'sprint';
  const qualifyingDate = new Date(nextRaceInfo.sessions.qualifying);
  const raceDate = new Date(nextRaceInfo.sessions.race);

  let sprintQualifyingDate = null;
  let sprintDate = null;
  if (isSprintWeekend) {
    sprintQualifyingDate = new Date(nextRaceInfo.sessions.sprintQualifying);
    sprintDate = new Date(nextRaceInfo.sessions.sprint);
  }

  const datesForWeatherApi = [qualifyingDate, raceDate];
  if (isSprintWeekend) {
    datesForWeatherApi.push(sprintQualifyingDate, sprintDate);
  }

  let qualifyingWeather;
  let raceWeather;
  let sprintQualifyingWeather;
  let sprintWeather;
  let weatherFetchFailed = false;

  const cachedWeatherData = weatherForecastCache;
  if (cachedWeatherData && Object.keys(cachedWeatherData).length > 0) {
    qualifyingWeather = cachedWeatherData.qualifyingWeather;
    raceWeather = cachedWeatherData.raceWeather;
    if (isSprintWeekend) {
      sprintQualifyingWeather = cachedWeatherData.sprintQualifyingWeather;
      sprintWeather = cachedWeatherData.sprintWeather;
    }
  } else {
    try {
      const weatherForecastsMap = await getWeatherForecast(
        nextRaceInfo.location.lat,
        nextRaceInfo.location.long,
        ...datesForWeatherApi
      );
      qualifyingWeather = weatherForecastsMap[qualifyingDate.toISOString()];
      raceWeather = weatherForecastsMap[raceDate.toISOString()];
      weatherForecastCache.qualifyingWeather = qualifyingWeather;
      weatherForecastCache.raceWeather = raceWeather;

      if (isSprintWeekend) {
        sprintQualifyingWeather =
          weatherForecastsMap[sprintQualifyingDate.toISOString()];
        sprintWeather = weatherForecastsMap[sprintDate.toISOString()];
        weatherForecastCache.sprintQualifyingWeather = sprintQualifyingWeather;
        weatherForecastCache.sprintWeather = sprintWeather;
      }

      if (typeof onFetch === 'function') {
        await onFetch({
          locality: nextRaceInfo.location.locality,
          country: nextRaceInfo.location.country,
        });
      }
    } catch (err) {
      weatherFetchFailed = true;
      if (typeof onError === 'function') {
        await onError(err);
      }
    }
  }

  return {
    status: 'ok',
    raceName: nextRaceInfo.raceName,
    circuitName: nextRaceInfo.circuitName,
    circuitImageUrl: nextRaceInfo.circuitImageUrl,
    location: nextRaceInfo.location,
    weekendFormat: nextRaceInfo.weekendFormat,
    isSprintWeekend,
    sessions: {
      qualifying: nextRaceInfo.sessions.qualifying,
      race: nextRaceInfo.sessions.race,
      ...(isSprintWeekend
        ? {
            sprintQualifying: nextRaceInfo.sessions.sprintQualifying,
            sprint: nextRaceInfo.sessions.sprint,
          }
        : {}),
    },
    historicalRaceStats: nextRaceInfo.historicalRaceStats || [],
    trackHistory: Array.isArray(nextRaceInfo.trackHistory)
      ? nextRaceInfo.trackHistory
      : [],
    weather: {
      qualifyingWeather,
      raceWeather,
      sprintQualifyingWeather,
      sprintWeather,
      fetchFailed: weatherFetchFailed,
    },
  };
}

module.exports = { getNextRaceInfo };
