const { KILZI_CHAT_ID } = require('../constants');

const mockSendLogMessage = jest.fn();

jest.mock('../utils', () => ({
  sendLogMessage: mockSendLogMessage,
  sendMessageToUser: jest.fn((bot, chatId, msg, opts) =>
    opts !== undefined ? bot.sendMessage(chatId, msg, opts) : bot.sendMessage(chatId, msg)
  ),
}));

jest.mock('../utils/utils', () => {
  const originalUtils = jest.requireActual('../utils/utils');

  return {
    formatDateTime: originalUtils.formatDateTime,
  };
});

const { getWeatherForecast } = require('../utils/weatherApi');
jest.mock('../utils/weatherApi', () => ({
  getWeatherForecast: jest.fn(),
}));

const { nextRaceInfoCache, weatherForecastCache, languageCache } = require('../cache');
const { setLanguage, t } = require('../i18n');

const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');

describe('handleNextRaceInfoCommand', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete nextRaceInfoCache.defaultSharedKey;
    Object.keys(weatherForecastCache).forEach(
      (key) => delete weatherForecastCache[key]
    );
    Object.keys(languageCache).forEach((key) => delete languageCache[key]);
  });

  it('should handle unavailable next race info', async () => {
    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Next race information is currently unavailable.'
    );
  });

  it('should display next race info with weather forecast when available and log location', async () => {
    const mockNextRaceInfo = {
      raceName: 'Monaco Grand Prix',
      circuitName: 'Circuit de Monaco',
      location: {
        lat: '43.7347',
        long: '7.42056',
        locality: 'Monte-Carlo',
        country: 'Monaco',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalRaceStats: [
        {
          season: 2024,
          winner: 'Charles Leclerc',
          constructor: 'Ferrari',
          polePosition: 'Max Verstappen',
          poleConstructor: 'Red Bull',
          secondPlaceDriver: 'Charles Leclerc',
          secondPlaceConstructor: 'Ferrari',
          thirdPlaceDriver: 'Lando Norris',
          thirdPlaceConstructor: 'McLaren',
          carsFinished: 16,
          overtakes: 42,
        },
        {
          season: 2023,
          winner: 'Max Verstappen',
          constructor: 'Red Bull',
          polePosition: 'Max Verstappen',
          poleConstructor: 'Red Bull',
          secondPlaceDriver: 'Charles Leclerc',
          secondPlaceConstructor: 'Ferrari',
          thirdPlaceDriver: 'Lando Norris',
          thirdPlaceConstructor: 'McLaren',
          carsFinished: 19,
          overtakes: 38,
        },
      ],
    };

    // Mock weather forecasts
    const qualifyingDate = new Date('2025-05-24T14:00:00Z');
    const raceDate = new Date('2025-05-25T13:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: {
        temperature: 22.5,
        precipitation: 30,
        wind: 15.2,
      },
      [raceDate.toISOString()]: {
        temperature: 24.0,
        precipitation: 10,
        wind: 12.5,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    const expectedMessage =
      `*Next Race Information*\n\n` +
      `🏎️ *Race Name:* Monaco Grand Prix\n` +
      `🏁 *Track:* Circuit de Monaco\n` +
      `📍 *Location:* Monte-Carlo, Monaco\n` +
      `📅 *Qualifying Date:* Saturday, 24 May 2025\n` +
      `⏰ *Qualifying Time:* 17:00 GMT+3\n` +
      `📅 *Race Date:* Sunday, 25 May 2025\n` +
      `⏰ *Race Time:* 16:00 GMT+3\n` +
      `📝 *Weekend Format:* Regular\n\n` +
      `*Weather Forecast:*\n` +
      `*Qualifying:*\n🌡️ Temp: 22.5°C\n🌧️ Rain: 30%\n💨 Wind: 15.2 km/h\n` +
      `*Race:*\n🌡️ Temp: 24°C\n🌧️ Rain: 10%\n💨 Wind: 12.5 km/h\n\n` +
      `*Historical Race Stats (Last Decade):*\n` +
      `*2024:*\n🚀 Pole: Max Verstappen (Red Bull)\n🏆 Winner: Charles Leclerc (Ferrari)\n🥈 2nd: Charles Leclerc (Ferrari)\n🥉 3rd: Lando Norris (McLaren)\n🏎️ Cars Finished: 16\n🔄 Overtakes: 42\n\n` +
      `*2023:*\n🚀 Pole: Max Verstappen (Red Bull)\n🏆 Winner: Max Verstappen (Red Bull)\n🥈 2nd: Charles Leclerc (Ferrari)\n🥉 3rd: Lando Norris (McLaren)\n🏎️ Cars Finished: 19\n🔄 Overtakes: 38\n\n`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );

    // Verify weather API was called with correct parameters
    expect(getWeatherForecast).toHaveBeenCalledWith(
      '43.7347',
      '7.42056',
      qualifyingDate,
      raceDate
    );

    // Verify log message for location
    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining(
        'Weather forecast fetched for location: Monte-Carlo, Monaco'
      )
    );
  });

  it('should display next race info with sprint sessions and weather for sprint weekend', async () => {
    const mockNextRaceInfo = {
      raceName: 'British Grand Prix',
      circuitName: 'Silverstone Circuit',
      location: {
        lat: '52.0786',
        long: '-1.0169',
        locality: 'Silverstone',
        country: 'UK',
      },
      sessions: {
        sprintQualifying: '2025-07-05T14:00:00Z',
        sprint: '2025-07-05T18:00:00Z',
        qualifying: '2025-07-04T16:00:00Z',
        race: '2025-07-06T14:00:00Z',
      },
      weekendFormat: 'sprint',
      historicalRaceStats: [
        {
          season: 2024,
          winner: 'Lewis Hamilton',
          constructor: 'Mercedes',
          polePosition: 'Lewis Hamilton',
          poleConstructor: 'Mercedes',
          secondPlaceDriver: 'George Russell',
          secondPlaceConstructor: 'Mercedes',
          thirdPlaceDriver: 'Max Verstappen',
          thirdPlaceConstructor: 'Red Bull',
          carsFinished: 18,
          overtakes: 35,
        },
        {
          season: 2023,
          winner: 'Max Verstappen',
          constructor: 'Red Bull',
          polePosition: 'Lewis Hamilton',
          poleConstructor: 'Mercedes',
          secondPlaceDriver: 'George Russell',
          secondPlaceConstructor: 'Mercedes',
          thirdPlaceDriver: 'Max Verstappen',
          thirdPlaceConstructor: 'Red Bull',
          carsFinished: 20,
          overtakes: 28,
        },
      ],
    };

    const sprintQualifyingDate = new Date('2025-07-05T14:00:00Z');
    const sprintDate = new Date('2025-07-05T18:00:00Z');
    const qualifyingDate = new Date('2025-07-04T16:00:00Z');
    const raceDate = new Date('2025-07-06T14:00:00Z');

    getWeatherForecast.mockResolvedValue({
      [sprintQualifyingDate.toISOString()]: {
        temperature: 20,
        precipitation: 10,
        wind: 8,
      },
      [sprintDate.toISOString()]: {
        temperature: 22,
        precipitation: 5,
        wind: 10,
      },
      [qualifyingDate.toISOString()]: {
        temperature: 19,
        precipitation: 15,
        wind: 7,
      },
      [raceDate.toISOString()]: {
        temperature: 23,
        precipitation: 0,
        wind: 12,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    const expectedMessage =
      `*Next Race Information*\n\n` +
      `🏎️ *Race Name:* British Grand Prix\n` +
      `🏁 *Track:* Silverstone Circuit\n` +
      `📍 *Location:* Silverstone, UK\n` +
      `📅 *Sprint Qualifying Date:* Saturday, 5 July 2025\n` +
      `⏰ *Sprint Qualifying Time:* 17:00 GMT+3\n` +
      `📅 *Sprint Date:* Saturday, 5 July 2025\n` +
      `⏰ *Sprint Time:* 21:00 GMT+3\n` +
      `📅 *Qualifying Date:* Friday, 4 July 2025\n` +
      `⏰ *Qualifying Time:* 19:00 GMT+3\n` +
      `📅 *Race Date:* Sunday, 6 July 2025\n` +
      `⏰ *Race Time:* 17:00 GMT+3\n` +
      `📝 *Weekend Format:* Sprint\n\n` +
      `*Weather Forecast:*\n` +
      `*Sprint Qualifying:*\n🌡️ Temp: 20°C\n🌧️ Rain: 10%\n💨 Wind: 8 km/h\n` +
      `*Sprint:*\n🌡️ Temp: 22°C\n🌧️ Rain: 5%\n💨 Wind: 10 km/h\n` +
      `*Qualifying:*\n🌡️ Temp: 19°C\n🌧️ Rain: 15%\n💨 Wind: 7 km/h\n` +
      `*Race:*\n🌡️ Temp: 23°C\n🌧️ Rain: 0%\n💨 Wind: 12 km/h\n\n` +
      `*Historical Race Stats (Last Decade):*\n` +
      `*2024:*\n🚀 Pole: Lewis Hamilton (Mercedes)\n🏆 Winner: Lewis Hamilton (Mercedes)\n🥈 2nd: George Russell (Mercedes)\n🥉 3rd: Max Verstappen (Red Bull)\n🏎️ Cars Finished: 18\n🔄 Overtakes: 35\n\n` +
      `*2023:*\n🚀 Pole: Lewis Hamilton (Mercedes)\n🏆 Winner: Max Verstappen (Red Bull)\n🥈 2nd: George Russell (Mercedes)\n🥉 3rd: Max Verstappen (Red Bull)\n🏎️ Cars Finished: 20\n🔄 Overtakes: 28\n\n`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );

    expect(getWeatherForecast).toHaveBeenCalledWith(
      '52.0786',
      '-1.0169',
      qualifyingDate,
      raceDate,
      sprintQualifyingDate,
      sprintDate
    );
  });

  it('should include safety cars and red flags in historical data if present', async () => {
    const mockNextRaceInfo = {
      circuitName: 'Test Circuit',
      location: {
        lat: '0',
        long: '0',
        locality: 'Testville',
        country: 'Testland',
      },
      sessions: {
        qualifying: '2025-01-01T10:00:00Z',
        race: '2025-01-02T10:00:00Z',
      },
      weekendFormat: 'regular',
      historicalRaceStats: [
        {
          season: 2025,
          winner: 'Test Winner',
          polePosition: 'Test Pole Driver',
          poleConstructor: 'Test Pole Constructor',
          secondPlaceDriver: 'Test Second Driver',
          secondPlaceConstructor: 'Test Second Constructor',
          thirdPlaceDriver: 'Test Third Driver',
          thirdPlaceConstructor: 'Test Third Constructor',
          carsFinished: 15,
          safetyCars: 2,
          redFlags: 1,
          overtakes: 25,
        },
        {
          season: 2024,
          winner: 'Another Winner',
          polePosition: 'Another Pole Driver',
          poleConstructor: 'Another Pole Constructor',
          secondPlaceDriver: 'Another Second Driver',
          secondPlaceConstructor: 'Another Second Constructor',
          thirdPlaceDriver: 'Another Third Driver',
          thirdPlaceConstructor: 'Another Third Constructor',
          carsFinished: 18,
          overtakes: 30,
          // no safetyCars or redFlags
        },
      ],
    };

    const qualifyingDate = new Date('2025-01-01T10:00:00Z');
    const raceDate = new Date('2025-01-02T10:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: {
        temperature: 20,
        precipitation: 10,
        wind: 5,
      },
      [raceDate.toISOString()]: {
        temperature: 22,
        precipitation: 0,
        wind: 7,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    // Find the message containing historical data
    const sentMessages = botMock.sendMessage.mock.calls.map((call) => call[1]);
    const historicalSection = sentMessages.find((m) =>
      m.includes('*Historical Race Stats (Last Decade):*')
    );

    expect(historicalSection).toContain('*2025:*');
    expect(historicalSection).toContain('⚠️🚓 Safety Cars: 2');
    expect(historicalSection).toContain('🚩 Red Flags: 1');
    expect(historicalSection).toContain('🔄 Overtakes: 25');

    // Extract just the 2024 entry and check it does not contain the new fields
    const entry2024 = historicalSection.split('*2024:*')[1].split('*')[0];
    expect(entry2024).not.toContain('⚠️🚓 Safety Cars:');
    expect(entry2024).not.toContain('🚩 Red Flags:');
  });

  it('should use cached weather forecast if available and not call getWeatherForecast again', async () => {
    const mockNextRaceInfo = {
      raceName: 'Monaco Grand Prix',
      circuitName: 'Circuit de Monaco',
      location: {
        lat: '43.7347',
        long: '7.42056',
        locality: 'Monte-Carlo',
        country: 'Monaco',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalRaceStats: [],
    };

    weatherForecastCache.qualifyingWeather = {
      temperature: 20,
      precipitation: 5,
      wind: 10,
    };
    weatherForecastCache.raceWeather = {
      temperature: 21,
      precipitation: 10,
      wind: 12,
    };

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    expect(getWeatherForecast).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('🌡️ Temp: 20°C'),
      expect.any(Object)
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('🌡️ Temp: 21°C'),
      expect.any(Object)
    );
    // Should not log fetching for location again
    expect(mockSendLogMessage).not.toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('Weather forecast fetched for location:')
    );
  });

  it('should handle weather API errors gracefully', async () => {
    const mockNextRaceInfo = {
      raceName: 'Monaco Grand Prix',
      circuitName: 'Circuit de Monaco',
      location: {
        lat: '43.7347',
        long: '7.42056',
        locality: 'Monte-Carlo',
        country: 'Monaco',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalRaceStats: [],
    };

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    // Mock weather API to throw an error
    getWeatherForecast.mockRejectedValue(new Error('API error'));

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining(`Weather API error:`)
    );
  });

  it('should handle missing overtakes data gracefully', async () => {
    const mockNextRaceInfo = {
      raceName: 'Test Grand Prix',
      circuitName: 'Test Circuit',
      location: {
        lat: '0',
        long: '0',
        locality: 'Testville',
        country: 'Testland',
      },
      sessions: {
        qualifying: '2025-01-01T10:00:00Z',
        race: '2025-01-02T10:00:00Z',
      },
      weekendFormat: 'regular',
      historicalRaceStats: [
        {
          season: 2025,
          winner: 'Test Winner',
          constructor: 'Test Constructor',
          polePosition: 'Test Pole Driver',
          poleConstructor: 'Test Pole Constructor',
          secondPlaceDriver: 'Test Second Driver',
          secondPlaceConstructor: 'Test Second Constructor',
          thirdPlaceDriver: 'Test Third Driver',
          thirdPlaceConstructor: 'Test Third Constructor',
          carsFinished: 15,
          overtakes: 25,
        },
        {
          season: 2024,
          winner: 'Another Winner',
          constructor: 'Another Constructor',
          polePosition: 'Another Pole Driver',
          poleConstructor: 'Another Pole Constructor',
          secondPlaceDriver: 'Another Second Driver',
          secondPlaceConstructor: 'Another Second Constructor',
          thirdPlaceDriver: 'Another Third Driver',
          thirdPlaceConstructor: 'Another Third Constructor',
          carsFinished: 18,
          // no overtakes data
        },
      ],
    };

    const qualifyingDate = new Date('2025-01-01T10:00:00Z');
    const raceDate = new Date('2025-01-02T10:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: {
        temperature: 20,
        precipitation: 10,
        wind: 5,
      },
      [raceDate.toISOString()]: {
        temperature: 22,
        precipitation: 0,
        wind: 7,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    // Find the message containing historical data
    const sentMessages = botMock.sendMessage.mock.calls.map((call) => call[1]);
    const historicalSection = sentMessages.find((m) =>
      m.includes('*Historical Race Stats (Last Decade):*')
    );

    // Check that 2025 entry has overtakes
    expect(historicalSection).toContain('*2025:*');
    expect(historicalSection).toContain('🔄 Overtakes: 25');

    // Check that 2024 entry doesn't have overtakes line
    expect(historicalSection).toContain('*2024:*');
    const entry2024 = historicalSection.split('*2024:*')[1].split('*')[0];
    expect(entry2024).not.toContain('🔄 Overtakes:');
  });

  it('should include track history in the correct language', async () => {
    const mockNextRaceInfo = {
      raceName: 'Test Grand Prix',
      circuitName: 'Test Circuit',
      location: {
        lat: '0',
        long: '0',
        locality: 'Testville',
        country: 'Testland',
      },
      sessions: {
        qualifying: '2025-01-01T10:00:00Z',
        race: '2025-01-02T10:00:00Z',
      },
      weekendFormat: 'regular',
      trackHistory: [
        { lang: 'en', text: 'History in English' },
        { lang: 'he', text: 'היסטוריה בעברית' },
      ],
      historicalRaceStats: [],
    };

    const qualifyingDate = new Date('2025-01-01T10:00:00Z');
    const raceDate = new Date('2025-01-02T10:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: {
        temperature: 20,
        precipitation: 10,
        wind: 5,
      },
      [raceDate.toISOString()]: {
        temperature: 22,
        precipitation: 0,
        wind: 7,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];
    expect(sentMessage).toContain(
      `*${t('Track History', KILZI_CHAT_ID)}:*\nHistory in English`
    );

    // Switch to Hebrew and verify
    setLanguage('he', KILZI_CHAT_ID);
    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    const hebrewMessage = botMock.sendMessage.mock.calls[1][1];
    expect(hebrewMessage).toContain(
      `*${t('Track History', KILZI_CHAT_ID)}:*\nהיסטוריה בעברית`
    );
  });

  it('should display dates in Hebrew when language is set', async () => {
    const mockNextRaceInfo = {
      raceName: 'Hebrew GP',
      circuitName: 'Some Circuit',
      location: {
        lat: '0',
        long: '0',
        locality: 'Tel Aviv',
        country: 'Israel',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalRaceStats: [],
    };

    const qualifyingDate = new Date('2025-05-24T14:00:00Z');
    const raceDate = new Date('2025-05-25T13:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: { temperature: 20, precipitation: 0, wind: 5 },
      [raceDate.toISOString()]: { temperature: 21, precipitation: 0, wind: 7 },
    });

    setLanguage('he', KILZI_CHAT_ID);
    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceInfoCommand(botMock, KILZI_CHAT_ID);

    const hebrewMessage = botMock.sendMessage.mock.calls[0][1];
    expect(hebrewMessage).toContain('יום שבת');
    expect(hebrewMessage).toContain('יום ראשון');
  });
});
