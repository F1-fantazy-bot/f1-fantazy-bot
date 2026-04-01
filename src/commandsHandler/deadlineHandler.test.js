const {
  buildDate,
  fetchCurrentSeasonRaces,
} = require('../raceScheduleService');
const {
  handleDeadlineCommand,
  buildDeadlineMessage,
  REFRESH_F1_COUNTDOWN_CALLBACK,
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
      date: '2026-05-25',
      time: '13:00:00Z',
    });
    buildDate.mockReturnValueOnce(new Date('2026-05-25T13:00:00Z'));

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
});
