jest.mock('../raceScheduleService', () => {
  const actual = jest.requireActual('../raceScheduleService');

  return {
    ...actual,
    fetchNextRace: jest.fn(),
  };
});

const { fetchNextRace } = require('../raceScheduleService');
const { getDeadlineSnapshot } = require('./deadlineCore');

describe('getDeadlineSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns status="unavailable" when fetchNextRace returns nothing', async () => {
    fetchNextRace.mockResolvedValue(null);
    const now = new Date('2026-05-01T10:00:00Z');

    const result = await getDeadlineSnapshot({ now });

    expect(result).toEqual({
      status: 'unavailable',
      nowIso: '2026-05-01T10:00:00.000Z',
    });
  });

  it('returns status="ok" with qualifying deadline for a regular weekend', async () => {
    fetchNextRace.mockResolvedValue({
      raceName: 'Spanish GP',
      Qualifying: { date: '2026-05-09', time: '14:00:00Z' },
    });
    const now = new Date('2026-05-01T10:00:00Z');

    const result = await getDeadlineSnapshot({ now });

    expect(result).toEqual({
      status: 'ok',
      raceName: 'Spanish GP',
      sessionType: 'qualifying',
      sessionLabel: 'quali',
      sessionStartsAt: '2026-05-09T14:00:00.000Z',
      nowIso: '2026-05-01T10:00:00.000Z',
      alreadyStarted: false,
    });
  });

  it('returns sprint as deadline session for sprint weekends', async () => {
    fetchNextRace.mockResolvedValue({
      raceName: 'Miami GP',
      Sprint: { date: '2026-05-02', time: '15:30:00Z' },
      Qualifying: { date: '2026-05-03', time: '15:30:00Z' },
    });
    const now = new Date('2026-05-01T10:00:00Z');

    const result = await getDeadlineSnapshot({ now });

    expect(result.sessionType).toBe('sprint');
    expect(result.sessionLabel).toBe('sprint');
    expect(result.sessionStartsAt).toBe('2026-05-02T15:30:00.000Z');
    expect(result.alreadyStarted).toBe(false);
  });

  it('marks alreadyStarted=true when the session is in the past', async () => {
    fetchNextRace.mockResolvedValue({
      raceName: 'Past GP',
      Qualifying: { date: '2026-05-01', time: '09:00:00Z' },
    });
    const now = new Date('2026-05-01T10:00:00Z');

    const result = await getDeadlineSnapshot({ now });

    expect(result.alreadyStarted).toBe(true);
    expect(result.sessionStartsAt).toBe('2026-05-01T09:00:00.000Z');
  });

  it('returns status="unavailable" + raceName when session has no startsAt', async () => {
    fetchNextRace.mockResolvedValue({ raceName: 'No-quali GP' });
    const now = new Date('2026-05-01T10:00:00Z');

    const result = await getDeadlineSnapshot({ now });

    expect(result).toEqual({
      status: 'unavailable',
      raceName: 'No-quali GP',
      nowIso: '2026-05-01T10:00:00.000Z',
    });
  });
});
