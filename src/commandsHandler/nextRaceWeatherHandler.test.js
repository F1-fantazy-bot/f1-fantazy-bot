const { KILZI_CHAT_ID } = require('../constants');

const mockSendLogMessage = jest.fn();

jest.mock('../utils', () => ({
  sendLogMessage: mockSendLogMessage,
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

const { nextRaceInfoCache, weatherForecastCache } = require('../cache');
const { handleNextRaceWeatherCommand } = require('./nextRaceWeatherHandler');
const { t } = require('../i18n');

describe('handleNextRaceWeatherCommand', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete nextRaceInfoCache.defaultSharedKey;
    delete weatherForecastCache.raceHourlyWeather;
    delete weatherForecastCache.qualifyingHourlyWeather;
    delete weatherForecastCache.sprintHourlyWeather;
    delete weatherForecastCache.sprintQualifyingHourlyWeather;
  });

  it('should handle unavailable next race info', async () => {
    await handleNextRaceWeatherCommand(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Next race information is currently unavailable.'
    );
  });

  it('should display weather forecast and log location', async () => {
    const mockNextRaceInfo = {
      raceName: 'Monaco GP',
      weekendFormat: 'sprint',
      location: { lat: '1', long: '2', locality: 'Town', country: 'Land' },
      sessions: {
        sprintQualifying: '2100-05-24T10:00:00Z',
        sprint: '2100-05-24T18:00:00Z',
        qualifying: '2100-05-24T14:00:00Z',
        race: '2100-05-25T13:00:00Z',
      },
    };
    const sprintQualiDate = new Date('2100-05-24T10:00:00Z');
    const qualifyingDate = new Date('2100-05-24T14:00:00Z');
    const sprintDate = new Date('2100-05-24T18:00:00Z');
    const raceDate = new Date('2100-05-25T13:00:00Z');

    const dates = [
      sprintQualiDate,
      new Date(sprintQualiDate.getTime() + 3600 * 1000),
      new Date(sprintQualiDate.getTime() + 2 * 3600 * 1000),
      qualifyingDate,
      new Date(qualifyingDate.getTime() + 3600 * 1000),
      new Date(qualifyingDate.getTime() + 2 * 3600 * 1000),
      sprintDate,
      new Date(sprintDate.getTime() + 3600 * 1000),
      new Date(sprintDate.getTime() + 2 * 3600 * 1000),
      raceDate,
      new Date(raceDate.getTime() + 3600 * 1000),
      new Date(raceDate.getTime() + 2 * 3600 * 1000),
    ];

    const resultMap = {};
    dates.forEach((d, i) => {
      resultMap[d.toISOString()] = {
        temperature: 20 + i,
        precipitation: 10 + i,
        wind: 5 + i,
        humidity: 50 + i,
        precipitation_mm: 0.1 * i,
        cloudCover: 30 + i,
      };
    });

    getWeatherForecast.mockResolvedValue(resultMap);

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceWeatherCommand(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*' + t('Next Race Weather Forecast', KILZI_CHAT_ID) + '*'),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Track', KILZI_CHAT_ID));
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Location', KILZI_CHAT_ID));
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Sprint Qualifying', KILZI_CHAT_ID));
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Qualifying', KILZI_CHAT_ID));
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Sprint', KILZI_CHAT_ID));
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Race', KILZI_CHAT_ID));
    expect(botMock.sendMessage.mock.calls[0][1]).toContain(t('Cloud Cover', KILZI_CHAT_ID));

    expect(getWeatherForecast).toHaveBeenCalled();
    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('Weather forecast fetched for location:')
    );
  });

  it('should use cached forecast if available', async () => {
    const mockNextRaceInfo = {
      raceName: 'Test',
      location: { lat: '1', long: '2', locality: 'Town', country: 'Land' },
      sessions: {
        qualifying: '2100-05-24T14:00:00Z',
        race: '2100-05-25T13:00:00Z',
      },
    };
    weatherForecastCache.raceHourlyWeather = Array(3).fill({ temperature: 20, precipitation: 10, wind: 5, humidity: 50, precipitation_mm: 0, cloudCover: 40 });
    weatherForecastCache.qualifyingHourlyWeather = Array(3).fill({ temperature: 20, precipitation: 10, wind: 5, humidity: 50, precipitation_mm: 0, cloudCover: 40 });
    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    await handleNextRaceWeatherCommand(botMock, KILZI_CHAT_ID);

    expect(getWeatherForecast).not.toHaveBeenCalled();
  });
});
