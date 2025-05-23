// Tests for getWeatherForecast in weatherApi.js

const { getWeatherForecast } = require('./weatherApi');

jest.mock('node-fetch');
const fetch = require('node-fetch');

describe('getWeatherForecast', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns correct weather data for two given dates and location', async () => {
    const mockData = {
      hourly: {
        time: ['2025-05-25T13:00', '2025-05-25T14:00'],
        temperature_2m: [22.5, 23.1],
        precipitation_probability: [10, 20],
        wind_speed_10m: [5.2, 6.1],
      },
    };
    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const lat = 43.7347;
    const lon = 7.42056;
    const date1 = new Date(Date.UTC(2025, 4, 25, 13, 0)); // 2025-05-25T13:00:00Z
    const date2 = new Date(Date.UTC(2025, 4, 25, 14, 0)); // 2025-05-25T14:00:00Z

    const result = await getWeatherForecast(lat, lon, date1, date2);

    expect(result).toEqual({
      [date1.toISOString()]: {
        temperature: 22.5,
        precipitation: 10,
        wind: 5.2,
      },
      [date2.toISOString()]: {
        temperature: 23.1,
        precipitation: 20,
        wind: 6.1,
      },
    });
    expect(fetch).toHaveBeenCalled();
  });

  it('throws if fetch fails', async () => {
    fetch.mockResolvedValue({ ok: false });
    await expect(getWeatherForecast(1, 2)).rejects.toThrow(
      'datesToFetch must be a non-empty array of Date objects'
    );
  });

  it('returns null values if hour not found', async () => {
    const mockData = {
      hourly: {
        time: ['2025-05-25T10:00'],
        temperature_2m: [18.0],
        precipitation_probability: [5],
        wind_speed_10m: [3.0],
      },
    };
    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const date1 = new Date(Date.UTC(2025, 4, 25, 13, 0)); // 2025-05-25T13:00:00Z
    const date2 = new Date(Date.UTC(2025, 4, 25, 14, 0)); // 2025-05-25T14:00:00Z
    const result = await getWeatherForecast(1, 2, date1, date2);

    expect(result).toEqual({
      [date1.toISOString()]: {
        temperature: null,
        precipitation: null,
        wind: null,
      },
      [date2.toISOString()]: {
        temperature: null,
        precipitation: null,
        wind: null,
      },
    });
  });
});
