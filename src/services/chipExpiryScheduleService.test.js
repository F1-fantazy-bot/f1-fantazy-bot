jest.mock('../raceScheduleService', () => ({
  ...jest.requireActual('../raceScheduleService'),
  fetchCurrentSeasonRaces: jest.fn(),
}));
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { createChipExpiry } = require('./chipExpiryScheduleService');
const { RACE_GRACE_MS, FALLBACK_TTL_MS } = require('../utils/chipExpiry');
const start = Date.parse('2026-09-20T13:00:00Z');
const race = { season: '2026', round: '17', date: '2026-09-20', time: '13:00:00Z' };

beforeEach(() => jest.clearAllMocks());

test.each([false, true])('expires after the Grand Prix for sprint=%s', async (sprint) => {
  fetchCurrentSeasonRaces.mockResolvedValue({ MRData: { RaceTable: { Races: [
    { ...race, ...(sprint ? { Sprint: { date: '2026-09-19' } } : {}) },
  ] } } });
  const result = await createChipExpiry({ now: start - 3 * 86400000 });
  expect(result.expiresAt).toBe(new Date(start + RACE_GRACE_MS).toISOString());
  expect(result.raceId).toBe('2026:17');
});

test('keeps the ongoing weekend until its cutoff, then uses the next weekend', async () => {
  fetchCurrentSeasonRaces.mockResolvedValue({ MRData: { RaceTable: { Races: [
    { ...race, date: '2026-09-27', round: '18' }, race,
  ] } } });
  expect((await createChipExpiry({ now: start + 3600000 })).raceId).toBe('2026:17');
  expect((await createChipExpiry({ now: start + RACE_GRACE_MS })).raceId).toBe('2026:18');
});

test('uses valid cached race time when the schedule fails', async () => {
  fetchCurrentSeasonRaces.mockRejectedValue(new Error('offline'));
  const result = await createChipExpiry({ now: start, cachedNextRaceInfo: {
    raceName: 'Test GP', sessions: { race: new Date(start).toISOString() },
  } });
  expect(result.expiresAt).toBe(new Date(start + RACE_GRACE_MS).toISOString());
});

test.each([undefined, { sessions: { race: 'invalid' } }, { sessions: { race: '2025-01-01T00:00:00Z' } }])(
  'falls back to exactly five days with unusable cached timing: %j', async (cachedNextRaceInfo) => {
    fetchCurrentSeasonRaces.mockRejectedValue(new Error('offline'));
    expect(await createChipExpiry({ now: start, cachedNextRaceInfo })).toEqual({
      selectedAt: new Date(start).toISOString(),
      expiresAt: new Date(start + FALLBACK_TTL_MS).toISOString(),
    });
  },
);
