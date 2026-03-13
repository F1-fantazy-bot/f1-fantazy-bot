const {
  buildDate,
  fetchCurrentSeasonRaces,
  filterUpcomingRaces,
  fetchRemainingRaceCount,
} = require('./raceScheduleService');

describe('raceScheduleService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('should fetch the current season races', async () => {
    const apiResponse = { MRData: { RaceTable: { season: '2025', Races: [] } } };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    await expect(fetchCurrentSeasonRaces()).resolves.toEqual(apiResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.jolpi.ca/ergast/f1/current.json'
    );
  });

  it('should throw when the season fetch fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(fetchCurrentSeasonRaces()).rejects.toThrow('HTTP 503');
  });

  it('should filter only upcoming races', () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-05-01T12:00:00Z'));

    const races = [
      {
        raceName: 'Past Grand Prix',
        date: '2025-04-01',
        time: '12:00:00Z',
      },
      {
        raceName: 'Monaco Grand Prix',
        date: '2025-05-25',
        time: '13:00:00Z',
      },
      {
        raceName: 'Canadian Grand Prix',
        date: '2025-06-15',
        time: '18:00:00Z',
      },
    ];

    expect(filterUpcomingRaces(races)).toEqual([races[1], races[2]]);
  });

  it('should return the full upcoming race count', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-05-01T12:00:00Z'));

    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          MRData: {
            RaceTable: {
              Races: [
                {
                  raceName: 'Monaco Grand Prix',
                  date: '2025-05-25',
                  time: '13:00:00Z',
                },
                {
                  raceName: 'Canadian Grand Prix',
                  date: '2025-06-15',
                  time: '18:00:00Z',
                },
                {
                  raceName: 'British Grand Prix',
                  date: '2025-07-06',
                  time: '14:00:00Z',
                },
              ],
            },
          },
        }),
    });

    await expect(fetchRemainingRaceCount()).resolves.toBe(3);
  });

  it('should parse dates with and without a trailing Z', () => {
    expect(buildDate('2025-05-25', '13:00:00Z')).toEqual(
      new Date('2025-05-25T13:00:00Z')
    );
    expect(buildDate('2025-05-25', '13:00:00')).toEqual(
      new Date('2025-05-25T13:00:00Z')
    );
  });
});
