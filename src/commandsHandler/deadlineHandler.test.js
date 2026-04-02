jest.mock('../raceScheduleService', () => {
  const actual = jest.requireActual('../raceScheduleService');

  return {
    ...actual,
    fetchNextRace: jest.fn(),
  };
});

const {
  formatDuration,
  getDeadlineSession,
  buildDeadlineMessage,
  getDeadlinePayload,
  handleDeadlineCommand,
} = require('./deadlineHandler');
const { fetchNextRace } = require('../raceScheduleService');

describe('deadlineHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats duration as days, hours, minutes and seconds', () => {
    const value = ((2 * 24 * 60 * 60) + (3 * 60 * 60) + (4 * 60) + 5) * 1000;

    expect(formatDuration(value)).toBe('2 days, 3 hours, 4 minutes and 5 seconds');
  });

  it('uses sprint as deadline in sprint weekend', () => {
    const session = getDeadlineSession({
      Sprint: {
        date: '2026-05-02',
        time: '15:30:00Z',
      },
      Qualifying: {
        date: '2026-05-03',
        time: '15:30:00Z',
      },
    });

    expect(session.type).toBe('sprint');
    expect(session.label).toBe('sprint');
    expect(session.startsAt).toEqual(new Date('2026-05-02T15:30:00Z'));
  });

  it('uses qualifying as deadline in regular weekend', () => {
    const session = getDeadlineSession({
      Qualifying: {
        date: '2026-05-03',
        time: '15:30:00Z',
      },
    });

    expect(session.type).toBe('qualifying');
    expect(session.label).toBe('quali');
    expect(session.startsAt).toEqual(new Date('2026-05-03T15:30:00Z'));
  });

  it('builds active countdown message in the requested format', () => {
    const message = buildDeadlineMessage(
      123,
      {
        label: 'quali',
        startsAt: new Date('2026-05-03T15:30:00Z'),
      },
      new Date('2026-05-01T15:30:00Z'),
    );

    expect(message).toBe(
      '*Teams Lock Deadline*\n\nSession type: quali\n\n2 days, 0 hours, 0 minutes and 0 seconds\n\nDont forget to lock the team before that time',
    );
  });

  it('builds started message when deadline already passed', () => {
    const message = buildDeadlineMessage(
      123,
      {
        label: 'sprint',
        startsAt: new Date('2026-05-01T15:30:00Z'),
      },
      new Date('2026-05-01T15:30:01Z'),
    );

    expect(message).toBe(
      '*Teams Lock Deadline*\n\nSession type: sprint\n\nThis session already started.\n\nDont forget to lock the team before that time',
    );
  });

  it('fetches race from raceScheduleService and builds payload', async () => {
    fetchNextRace.mockResolvedValue({
      raceName: 'Miami Grand Prix',
      Qualifying: {
        date: '2026-05-03',
        time: '15:30:00Z',
      },
    });

    const payload = await getDeadlinePayload(123, new Date('2026-05-01T15:30:00Z'));

    expect(fetchNextRace).toHaveBeenCalledTimes(1);
    expect(payload.text).toContain('Session type: quali');
    expect(payload.options.parse_mode).toBe('Markdown');
    expect(payload.options.reply_markup.inline_keyboard[0][0].callback_data).toBe('DEADLINE:refresh');
  });

  it('sends fallback error message when service fails', async () => {
    fetchNextRace.mockRejectedValue(new Error('boom'));

    const botMock = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    const msg = { chat: { id: 123 } };

    await handleDeadlineCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'Failed to fetch deadline data. Please try again later.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'DEADLINE:refresh' }]],
        },
      },
    );
  });
});
