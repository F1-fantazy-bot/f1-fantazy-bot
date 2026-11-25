jest.mock('./azureStorageService', () => ({ getRaceCalendar: jest.fn() }));

const { getRaceCalendar } = require('./azureStorageService');
const {
  buildDate,
  fetchCurrentSeasonRaces,
  fetchNextRace,
  filterUpcomingRaces,
  fetchRemainingRaceCount,
} = require('./raceScheduleService');

const races = [
  { round: '1', raceName: 'Past Grand Prix', date: '2025-04-01', time: '12:00:00Z' },
  { round: '2', raceName: 'Monaco Grand Prix', date: '2025-05-25', time: '13:00:00Z' },
  { round: '3', raceName: 'Canadian Grand Prix', date: '2025-06-15', time: '18:00:00Z' },
].map((race) => ({ ...race, season: '2025', Circuit: { circuitId: 'circuit' } }));

const calendar = {
  fetchedAt: '2025-01-02T12:00:00Z',
  MRData: {
    limit: '100',
    offset: '0',
    total: '3',
    RaceTable: { season: '2025', Races: [...races].reverse() },
  },
};

describe('raceScheduleService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2025-05-01T12:00:00Z'));
    getRaceCalendar.mockResolvedValue(calendar);
  });

  afterEach(() => jest.useRealTimers());

  it('retains the calendar response and forwards the caller abort signal', async () => {
    const signal = new AbortController().signal;
    await expect(fetchCurrentSeasonRaces({ signal })).resolves.toEqual(calendar);
    expect(getRaceCalendar).toHaveBeenCalledWith({ signal });
  });

  it('selects the earliest upcoming UTC start from an unordered calendar', async () => {
    await expect(fetchNextRace()).resolves.toEqual(races[1]);
    jest.setSystemTime(new Date('2025-05-25T13:01:00Z'));
    await expect(fetchNextRace()).resolves.toEqual(races[2]);
  });

  it('propagates failures to the schedule callers', async () => {
    getRaceCalendar.mockRejectedValue(new Error('BlobNotFound'));
    await expect(fetchCurrentSeasonRaces()).rejects.toThrow('BlobNotFound');
    await expect(fetchNextRace()).rejects.toThrow('BlobNotFound');
  });

  it('rejects a truncated calendar and a previous-year calendar after rollover', async () => {
    getRaceCalendar.mockResolvedValueOnce({ ...calendar, MRData: { ...calendar.MRData, total: '4' } });
    await expect(fetchCurrentSeasonRaces()).rejects.toThrow('Invalid cached F1 season calendar');
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await expect(fetchCurrentSeasonRaces()).rejects.toThrow('Invalid cached F1 season calendar');
  });

  it('filters and counts upcoming races', async () => {
    expect(filterUpcomingRaces(races)).toEqual(races.slice(1));
    await expect(fetchRemainingRaceCount()).resolves.toBe(2);
  });

  it('returns no races after the season ends', async () => {
    jest.setSystemTime(new Date('2025-12-30T00:00:00Z'));
    await expect(fetchNextRace()).resolves.toBeNull();
    await expect(fetchRemainingRaceCount()).resolves.toBe(0);
  });

  it('parses dates with and without a trailing Z', () => {
    expect(buildDate('2025-05-25', '13:00:00Z')).toEqual(new Date('2025-05-25T13:00:00Z'));
    expect(buildDate('2025-05-25', '13:00:00')).toEqual(new Date('2025-05-25T13:00:00Z'));
  });
});
