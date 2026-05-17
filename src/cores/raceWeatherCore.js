const {
  nextRaceInfoCache,
  sharedKey,
  weatherForecastCache,
} = require('../cache');
const { getWeatherForecast } = require('../utils/weatherApi');

// Returns the per-session hourly weather snapshot for the next race.
// Both the Telegram adapter and the agent tool consume this. The
// `now` argument makes the 3-hour-from-now filter testable. The
// Telegram adapter wires `onFetch` / `onError` to bot-side logging
// helpers; the agent path omits them.
async function getRaceWeather({ now = new Date(), onFetch, onError } = {}) {
  const nextRaceInfo = nextRaceInfoCache[sharedKey];

  if (!nextRaceInfo) {
    return { status: 'unavailable' };
  }

  const qualifyingDate = new Date(nextRaceInfo.sessions.qualifying);
  const raceDate = new Date(nextRaceInfo.sessions.race);
  const isSprintWeekend = nextRaceInfo.weekendFormat === 'sprint';

  const sessions = [
    {
      key: 'qualifyingHourlyWeather',
      label: 'Qualifying',
      start: qualifyingDate,
    },
    { key: 'raceHourlyWeather', label: 'Race', start: raceDate },
  ];

  if (isSprintWeekend) {
    const sprintQualiDate = new Date(nextRaceInfo.sessions.sprintQualifying);
    const sprintDate = new Date(nextRaceInfo.sessions.sprint);
    sessions.push({
      key: 'sprintQualifyingHourlyWeather',
      label: 'Sprint Qualifying',
      start: sprintQualiDate,
    });
    sessions.push({
      key: 'sprintHourlyWeather',
      label: 'Sprint',
      start: sprintDate,
    });
  }

  sessions.sort((a, b) => a.start - b.start);

  const nowRounded = new Date(
    Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000
  );

  const timesToFetch = [];
  sessions.forEach((s) => {
    s.hours = [
      s.start,
      new Date(s.start.getTime() + 60 * 60 * 1000),
      new Date(s.start.getTime() + 2 * 60 * 60 * 1000),
    ].filter((h) => h >= nowRounded);
    s.forecast = weatherForecastCache[s.key];
    timesToFetch.push(...s.hours);
  });

  const needFetch = sessions.some((s) => !s.forecast);
  let fetchFailed = false;
  if (needFetch) {
    try {
      const weatherForecastsMap = await getWeatherForecast(
        nextRaceInfo.location.lat,
        nextRaceInfo.location.long,
        ...timesToFetch
      );
      sessions.forEach((s) => {
        if (!s.forecast) {
          s.forecast = s.hours.map((h) => weatherForecastsMap[h.toISOString()]);
          weatherForecastCache[s.key] = s.forecast;
        }
      });
      if (typeof onFetch === 'function') {
        await onFetch({
          locality: nextRaceInfo.location.locality,
          country: nextRaceInfo.location.country,
        });
      }
    } catch (err) {
      fetchFailed = true;
      if (typeof onError === 'function') {
        await onError(err);
      }
    }
  }

  if (sessions.some((s) => !s.forecast)) {
    return { status: 'unavailable', fetchFailed };
  }

  return {
    status: 'ok',
    raceName: nextRaceInfo.raceName,
    circuitName: nextRaceInfo.circuitName,
    location: nextRaceInfo.location,
    isSprintWeekend,
    sessions: sessions.map((s) => ({
      key: s.key,
      label: s.label,
      startsAt: s.start.toISOString(),
      hours: s.hours.map((h) => h.toISOString()),
      forecasts: s.forecast,
    })),
  };
}

module.exports = { getRaceWeather };
