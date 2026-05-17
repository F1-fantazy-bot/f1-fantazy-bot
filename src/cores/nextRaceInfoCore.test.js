jest.mock('../utils/weatherApi', () => ({
  getWeatherForecast: jest.fn(),
}));

const { getWeatherForecast } = require('../utils/weatherApi');
const {
  nextRaceInfoCache,
  weatherForecastCache,
  sharedKey,
} = require('../cache');
const { getNextRaceInfo } = require('./nextRaceInfoCore');

const fixture = {
  raceName: 'Monaco Grand Prix',
  circuitName: 'Circuit de Monaco',
  circuitImageUrl: 'http://example.com/circuit.jpg',
  location: { lat: '43.7', long: '7.4', locality: 'Monte-Carlo', country: 'Monaco' },
  weekendFormat: 'regular',
  sessions: {
    qualifying: '2099-05-24T14:00:00Z',
    race: '2099-05-25T13:00:00Z',
  },
  historicalRaceStats: [{ season: 2024, winner: 'Leclerc' }],
  trackHistory: [{ lang: 'en', text: 'storied venue' }],
};

const sprintFixture = {
  ...fixture,
  weekendFormat: 'sprint',
  sessions: {
    qualifying: '2099-05-24T14:00:00Z',
    race: '2099-05-25T13:00:00Z',
    sprintQualifying: '2099-05-24T10:00:00Z',
    sprint: '2099-05-24T17:00:00Z',
  },
};

describe('getNextRaceInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete nextRaceInfoCache[sharedKey];
    Object.keys(weatherForecastCache).forEach(
      (key) => delete weatherForecastCache[key]
    );
  });

  it('returns status="unavailable" when cache empty', async () => {
    const result = await getNextRaceInfo();

    expect(result).toEqual({ status: 'unavailable' });
    expect(getWeatherForecast).not.toHaveBeenCalled();
  });

  it('returns status="ok" with passthrough fields + fresh-fetched weather', async () => {
    nextRaceInfoCache[sharedKey] = fixture;
    getWeatherForecast.mockResolvedValue({
      '2099-05-24T14:00:00.000Z': { temperature: 18, precipitation: 10, wind: 5 },
      '2099-05-25T13:00:00.000Z': { temperature: 22, precipitation: 0, wind: 3 },
    });

    const onFetch = jest.fn();
    const result = await getNextRaceInfo({ onFetch });

    expect(result.status).toBe('ok');
    expect(result.raceName).toBe('Monaco Grand Prix');
    expect(result.isSprintWeekend).toBe(false);
    expect(result.sessions).toEqual({
      qualifying: '2099-05-24T14:00:00Z',
      race: '2099-05-25T13:00:00Z',
    });
    expect(result.weather.qualifyingWeather).toEqual({
      temperature: 18,
      precipitation: 10,
      wind: 5,
    });
    expect(result.weather.raceWeather).toEqual({
      temperature: 22,
      precipitation: 0,
      wind: 3,
    });
    expect(result.weather.fetchFailed).toBe(false);
    expect(onFetch).toHaveBeenCalledWith({
      locality: 'Monte-Carlo',
      country: 'Monaco',
    });
    expect(weatherForecastCache.qualifyingWeather).toBeDefined();
    expect(weatherForecastCache.raceWeather).toBeDefined();
  });

  it('uses cached weather and does not fetch when cache populated', async () => {
    nextRaceInfoCache[sharedKey] = fixture;
    weatherForecastCache.qualifyingWeather = { temperature: 19 };
    weatherForecastCache.raceWeather = { temperature: 24 };

    const onFetch = jest.fn();
    const result = await getNextRaceInfo({ onFetch });

    expect(getWeatherForecast).not.toHaveBeenCalled();
    expect(onFetch).not.toHaveBeenCalled();
    expect(result.weather.qualifyingWeather).toEqual({ temperature: 19 });
    expect(result.weather.raceWeather).toEqual({ temperature: 24 });
  });

  it('invokes onError on weather fetch failure and sets fetchFailed=true', async () => {
    nextRaceInfoCache[sharedKey] = fixture;
    getWeatherForecast.mockRejectedValue(new Error('boom'));

    const onError = jest.fn();
    const result = await getNextRaceInfo({ onError });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(result.status).toBe('ok');
    expect(result.weather.fetchFailed).toBe(true);
    expect(result.weather.qualifyingWeather).toBeUndefined();
  });

  it('handles sprint weekend: includes sprint sessions + weather', async () => {
    nextRaceInfoCache[sharedKey] = sprintFixture;
    getWeatherForecast.mockResolvedValue({
      '2099-05-24T14:00:00.000Z': { temperature: 18 },
      '2099-05-25T13:00:00.000Z': { temperature: 22 },
      '2099-05-24T10:00:00.000Z': { temperature: 16 },
      '2099-05-24T17:00:00.000Z': { temperature: 20 },
    });

    const result = await getNextRaceInfo();

    expect(result.isSprintWeekend).toBe(true);
    expect(result.sessions).toEqual({
      qualifying: '2099-05-24T14:00:00Z',
      race: '2099-05-25T13:00:00Z',
      sprintQualifying: '2099-05-24T10:00:00Z',
      sprint: '2099-05-24T17:00:00Z',
    });
    expect(result.weather.sprintQualifyingWeather).toEqual({ temperature: 16 });
    expect(result.weather.sprintWeather).toEqual({ temperature: 20 });
  });

  it('returns empty arrays for missing historicalRaceStats and trackHistory', async () => {
    nextRaceInfoCache[sharedKey] = {
      ...fixture,
      historicalRaceStats: undefined,
      trackHistory: undefined,
    };
    getWeatherForecast.mockResolvedValue({
      '2099-05-24T14:00:00.000Z': { temperature: 18 },
      '2099-05-25T13:00:00.000Z': { temperature: 22 },
    });

    const result = await getNextRaceInfo();

    expect(result.historicalRaceStats).toEqual([]);
    expect(result.trackHistory).toEqual([]);
  });
});
