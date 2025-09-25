const { KILZI_CHAT_ID } = require('../constants');

const mockSendLogMessage = jest.fn();

jest.mock('../utils', () => {
  const original = jest.requireActual('../utils');

  return {
    ...original,
    sendLogMessage: mockSendLogMessage,
  };
});

const { handleNextRacesCommand } = require('./nextRacesHandler');

describe('handleNextRacesCommand', () => {
  const originalFetch = global.fetch;
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('should send upcoming races information when available', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-05-01T12:00:00Z'));

    const apiResponse = {
      MRData: {
        RaceTable: {
          season: '2025',
          Races: [
            {
              round: '7',
              raceName: 'Monaco Grand Prix',
              date: '2025-05-25',
              time: '13:00:00Z',
              url: 'https://en.wikipedia.org/wiki/2025_Monaco_Grand_Prix',
              Circuit: {
                circuitName: 'Circuit de Monaco',
                Location: {
                  locality: 'Monte-Carlo',
                  country: 'Monaco',
                },
              },
              FirstPractice: {
                date: '2025-05-23',
                time: '11:30:00Z',
              },
              SecondPractice: {
                date: '2025-05-23',
                time: '15:00:00Z',
              },
              ThirdPractice: {
                date: '2025-05-24',
                time: '11:30:00Z',
              },
              Qualifying: {
                date: '2025-05-24',
                time: '15:00:00Z',
              },
            },
            {
              round: '8',
              raceName: 'Canadian Grand Prix',
              date: '2025-06-15',
              time: '18:00:00Z',
              url: 'https://en.wikipedia.org/wiki/2025_Canadian_Grand_Prix',
              Circuit: {
                circuitName: 'Circuit Gilles Villeneuve',
                Location: {
                  locality: 'Montreal',
                  country: 'Canada',
                },
              },
              FirstPractice: {
                date: '2025-06-13',
                time: '17:00:00Z',
              },
              SecondPractice: {
                date: '2025-06-13',
                time: '21:00:00Z',
              },
              ThirdPractice: {
                date: '2025-06-14',
                time: '18:00:00Z',
              },
              Qualifying: {
                date: '2025-06-14',
                time: '22:00:00Z',
              },
            },
          ],
        },
      },
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    await handleNextRacesCommand(botMock, KILZI_CHAT_ID);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.jolpi.ca/ergast/f1/current.json'
    );
    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Upcoming Races - 2025*'),
      { parse_mode: 'Markdown' }
    );

    const sentMessage = botMock.sendMessage.mock.calls[0][1];
    expect(sentMessage).toContain('Round 7: Monaco Grand Prix');
    expect(sentMessage).toContain('Circuit de Monaco');
    expect(sentMessage).toContain('📅 Sessions:');
    expect(sentMessage).toContain('FP1');
    expect(sentMessage).toContain('Canadian Grand Prix');
  });

  it('should notify when no upcoming races are found', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-12-01T12:00:00Z'));

    const apiResponse = {
      MRData: {
        RaceTable: {
          season: '2025',
          Races: [
            {
              round: '1',
              raceName: 'Bahrain Grand Prix',
              date: '2025-03-01',
              time: '15:00:00Z',
            },
          ],
        },
      },
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    await handleNextRacesCommand(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'No upcoming races found for this season.'
    );
  });

  it('should handle fetch errors gracefully', async () => {
    const error = new Error('Network failure');
    global.fetch.mockRejectedValue(error);

    await handleNextRacesCommand(botMock, KILZI_CHAT_ID);

    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      'Failed to fetch upcoming races: Network failure'
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Unable to fetch upcoming races. Please try again later.'
    );
  });
});
