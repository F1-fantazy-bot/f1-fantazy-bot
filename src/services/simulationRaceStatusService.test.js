jest.mock('../raceScheduleService', () => ({
  buildDate: jest.fn(),
  fetchNextRace: jest.fn(),
}));

const { buildDate, fetchNextRace } = require('../raceScheduleService');
const {
  getUpcomingRaceIdentity,
  isFutureCachedRace,
  normalizeScheduleRace,
} = require('./simulationRaceStatusService');

const NOW = Date.parse('2026-09-02T12:00:00.000Z');

describe('simulationRaceStatusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses the live schedule as the authoritative upcoming race', async () => {
    fetchNextRace.mockResolvedValue({
      round: '14',
      raceName: 'Italian Grand Prix',
      Circuit: {
        circuitName: 'Autodromo Nazionale Monza',
        Location: { locality: 'Monza' },
      },
    });

    await expect(getUpcomingRaceIdentity({
      cachedNextRaceInfo: { raceName: 'Dutch Grand Prix' },
      now: NOW,
    })).resolves.toEqual({
      raceName: 'Italian Grand Prix',
      circuitName: 'Autodromo Nazionale Monza',
      location: { locality: 'Monza' },
    });
  });

  test('uses cached next-race data only when its race session is in the future', async () => {
    fetchNextRace.mockRejectedValue(new Error('schedule unavailable'));
    const cachedNextRaceInfo = {
      raceName: 'Italian Grand Prix',
      sessions: { race: '2026-09-06T13:00:00.000Z' },
    };

    await expect(getUpcomingRaceIdentity({ cachedNextRaceInfo, now: NOW }))
      .resolves.toBe(cachedNextRaceInfo);
    expect(isFutureCachedRace(cachedNextRaceInfo, NOW)).toBe(true);
  });

  test('does not use a stale cached next-race record after schedule failure', async () => {
    fetchNextRace.mockRejectedValue(new Error('schedule unavailable'));
    const cachedNextRaceInfo = {
      raceName: 'Dutch Grand Prix',
      sessions: { race: '2026-08-30T13:00:00.000Z' },
    };

    await expect(getUpcomingRaceIdentity({ cachedNextRaceInfo, now: NOW }))
      .resolves.toBeNull();
    expect(isFutureCachedRace(cachedNextRaceInfo, NOW)).toBe(false);
  });

  test('normalizes only the schedule fields needed for race comparison', () => {
    expect(normalizeScheduleRace({ raceName: 'Monza', private: 'secret' }))
      .toEqual({ raceName: 'Monza', circuitName: null, location: { locality: null } });
    buildDate.mockReturnValue(new Date('2026-09-06T13:00:00.000Z'));
    expect(isFutureCachedRace({ date: '2026-09-06', time: '13:00:00Z' }, NOW)).toBe(true);
  });
});
