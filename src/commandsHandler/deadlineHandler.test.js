const {
  buildDate,
  fetchCurrentSeasonRaces,
} = require('../raceScheduleService');
const {
  handleDeadlineCommand,
  buildDeadlineMessage,
  REFRESH_F1_COUNTDOWN_CALLBACK,
  getDeadlineDateForRace,
} = require('./deadlineHandler');

jest.mock('../raceScheduleService', () => ({
  buildDate: jest.fn(),
  fetchCurrentSeasonRaces: jest.fn(),
  findNextRace: jest.fn(),
}));

const { findNextRace } = require('../raceScheduleService');

describe('deadlineHandler', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should format deadline message with countdown', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T00:00:00Z'));

    const message = buildDeadlineMessage(
      'Monaco Grand Prix',
      new Date('2026-04-02T01:02:03Z'),
      123,
    );

    expect(message).toBe(
      '🏎️ **Monaco Grand Prix** starts in:\n⏳ 1 days, 1 hours, 2 minutes, 3 seconds.',
    );

    jest.useRealTimers();
  });

  it('should send countdown with refresh button', async () => {
    fetchCurrentSeasonRaces.mockResolvedValueOnce({
      MRData: { RaceTable: { Races: [{ raceName: 'Monaco GP' }] } },
    });
    findNextRace.mockReturnValueOnce({
      raceName: 'Monaco GP',
      Qualifying: { date: '2026-05-24', time: '14:00:00Z' },
    });
    buildDate.mockReturnValueOnce(new Date('2026-05-24T14:00:00Z'));

    await handleDeadlineCommand(botMock, { chat: { id: 123 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('🏎️ **Monaco GP** starts in:'),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: REFRESH_F1_COUNTDOWN_CALLBACK }],
          ],
        },
      },
    );
  });

  it('should send fallback when no upcoming race exists', async () => {
    fetchCurrentSeasonRaces.mockResolvedValueOnce({
      MRData: { RaceTable: { Races: [] } },
    });
    findNextRace.mockReturnValueOnce(null);

    await handleDeadlineCommand(botMock, { chat: { id: 123 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(123, 'No upcoming race found.');
  });

  it('should use sprint date for sprint weekends', () => {
    buildDate
      .mockReturnValueOnce(new Date('2026-05-03T10:00:00Z'));

    const date = getDeadlineDateForRace({
      Sprint: { date: '2026-05-03', time: '10:00:00Z' },
      Qualifying: { date: '2026-05-02', time: '14:00:00Z' },
      date: '2026-05-04',
      time: '13:00:00Z',
    });

    expect(date).toEqual(new Date('2026-05-03T10:00:00Z'));
    expect(buildDate).toHaveBeenCalledWith('2026-05-03', '10:00:00Z');
  });

  it('should use qualifying date for regular weekends', () => {
    buildDate
      .mockReturnValueOnce(new Date('2026-05-02T14:00:00Z'));

    const date = getDeadlineDateForRace({
      Qualifying: { date: '2026-05-02', time: '14:00:00Z' },
      date: '2026-05-04',
      time: '13:00:00Z',
    });

    expect(date).toEqual(new Date('2026-05-02T14:00:00Z'));
    expect(buildDate).toHaveBeenCalledWith('2026-05-02', '14:00:00Z');
  });
});
