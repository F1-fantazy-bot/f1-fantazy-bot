jest.mock('../utils/weatherApi', () => ({
  getWeatherForecast: jest.fn(),
}));

const { getWeatherForecast } = require('../utils/weatherApi');
const {
  nextRaceInfoCache,
  weatherForecastCache,
  sharedKey,
} = require('../cache');
const { getRaceWeather } = require('./raceWeatherCore');

const baseFixture = {
  raceName: 'Monaco GP',
  circuitName: 'Circuit de Monaco',
  weekendFormat: 'regular',
  location: { lat: '1', long: '2', locality: 'Town', country: 'Land' },
  sessions: {
    qualifying: '2099-05-24T14:00:00Z',
    race: '2099-05-25T13:00:00Z',
  },
};

const sprintFixture = {
  ...baseFixture,
  weekendFormat: 'sprint',
  sessions: {
    qualifying: '2099-05-24T14:00:00Z',
    race: '2099-05-25T13:00:00Z',
    sprintQualifying: '2099-05-24T10:00:00Z',
    sprint: '2099-05-24T18:00:00Z',
  },
};

function buildForecastMap(dates) {
  const map = {};
  dates.forEach((d, i) => {
    map[d.toISOString()] = {
      temperature: 20 + i,
      precipitation: 10 + i,
      precipitation_mm: 0.1 * i,
      wind: 5 + i,
      humidity: 50 + i,
      cloudCover: 30 + i,
    };
  });

  return map;
}

describe('getRaceWeather', () => {
  const NOW = new Date('2099-01-01T00:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    delete nextRaceInfoCache[sharedKey];
    Object.keys(weatherForecastCache).forEach(
      (key) => delete weatherForecastCache[key]
    );
  });

  it('returns status="unavailable" when cache empty', async () => {
    const result = await getRaceWeather({ now: NOW });

    expect(result).toEqual({ status: 'unavailable' });
    expect(getWeatherForecast).not.toHaveBeenCalled();
  });

  it('fetches and returns 3 hours per session for a future regular weekend', async () => {
    nextRaceInfoCache[sharedKey] = baseFixture;
    const qualiDate = new Date(baseFixture.sessions.qualifying);
    const raceDate = new Date(baseFixture.sessions.race);
    const allDates = [
      qualiDate,
      new Date(qualiDate.getTime() + 3600 * 1000),
      new Date(qualiDate.getTime() + 7200 * 1000),
      raceDate,
      new Date(raceDate.getTime() + 3600 * 1000),
      new Date(raceDate.getTime() + 7200 * 1000),
    ];
    getWeatherForecast.mockResolvedValue(buildForecastMap(allDates));

    const onFetch = jest.fn();
    const result = await getRaceWeather({ now: NOW, onFetch });

    expect(result.status).toBe('ok');
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].label).toBe('Qualifying');
    expect(result.sessions[1].label).toBe('Race');
    expect(result.sessions[0].hours).toHaveLength(3);
    expect(result.sessions[0].forecasts).toHaveLength(3);
    expect(result.sessions[0].startsAt).toBe(qualiDate.toISOString());
    expect(onFetch).toHaveBeenCalledWith({ locality: 'Town', country: 'Land' });
    expect(weatherForecastCache.qualifyingHourlyWeather).toHaveLength(3);
    expect(weatherForecastCache.raceHourlyWeather).toHaveLength(3);
  });

  it('uses cached hourly forecasts and skips fetch', async () => {
    nextRaceInfoCache[sharedKey] = baseFixture;
    const cachedHours = Array(3).fill({
      temperature: 20,
      precipitation: 0,
      precipitation_mm: 0,
      wind: 1,
      humidity: 10,
      cloudCover: 5,
    });
    weatherForecastCache.qualifyingHourlyWeather = cachedHours;
    weatherForecastCache.raceHourlyWeather = cachedHours;

    const onFetch = jest.fn();
    const result = await getRaceWeather({ now: NOW, onFetch });

    expect(result.status).toBe('ok');
    expect(getWeatherForecast).not.toHaveBeenCalled();
    expect(onFetch).not.toHaveBeenCalled();
    expect(result.sessions[0].forecasts).toBe(cachedHours);
  });

  it('returns status="unavailable" + fetchFailed=true on fetch failure', async () => {
    nextRaceInfoCache[sharedKey] = baseFixture;
    getWeatherForecast.mockRejectedValue(new Error('boom'));

    const onError = jest.fn();
    const result = await getRaceWeather({ now: NOW, onError });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(result.status).toBe('unavailable');
    expect(result.fetchFailed).toBe(true);
  });

  it('filters out hours before nowRounded', async () => {
    nextRaceInfoCache[sharedKey] = baseFixture;
    // nowRounded floors to 15:00. Quali starts 14:00 → drops; +1h (15:00) stays;
    // +2h (16:00) stays. Race is the next day → all 3 hours stay.
    const nowAfterQualiStart = new Date('2099-05-24T15:30:00Z');
    const qualiDate = new Date(baseFixture.sessions.qualifying);
    const raceDate = new Date(baseFixture.sessions.race);
    const remainingQualiHours = [
      new Date(qualiDate.getTime() + 3600 * 1000),
      new Date(qualiDate.getTime() + 2 * 3600 * 1000),
    ];
    const remainingRaceHours = [
      raceDate,
      new Date(raceDate.getTime() + 3600 * 1000),
      new Date(raceDate.getTime() + 7200 * 1000),
    ];
    getWeatherForecast.mockResolvedValue(
      buildForecastMap([...remainingQualiHours, ...remainingRaceHours])
    );

    const result = await getRaceWeather({ now: nowAfterQualiStart });

    expect(result.status).toBe('ok');
    expect(result.sessions[0].hours).toHaveLength(2);
    expect(result.sessions[1].hours).toHaveLength(3);
  });

  it('includes sprint sessions for sprint weekends and sorts chronologically', async () => {
    nextRaceInfoCache[sharedKey] = sprintFixture;
    const sprintQualiDate = new Date(sprintFixture.sessions.sprintQualifying);
    const qualiDate = new Date(sprintFixture.sessions.qualifying);
    const sprintDate = new Date(sprintFixture.sessions.sprint);
    const raceDate = new Date(sprintFixture.sessions.race);
    const allDates = [];
    [sprintQualiDate, qualiDate, sprintDate, raceDate].forEach((start) => {
      for (let i = 0; i < 3; i++) {
        allDates.push(new Date(start.getTime() + i * 3600 * 1000));
      }
    });
    getWeatherForecast.mockResolvedValue(buildForecastMap(allDates));

    const result = await getRaceWeather({ now: NOW });

    expect(result.isSprintWeekend).toBe(true);
    expect(result.sessions.map((s) => s.label)).toEqual([
      'Sprint Qualifying',
      'Qualifying',
      'Sprint',
      'Race',
    ]);
  });
});
