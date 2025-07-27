const { sendLogMessage } = require('../utils');
const { formatDateTime } = require('../utils/utils');
const { getWeatherForecast } = require('../utils/weatherApi');
const { MAX_TELEGRAM_MESSAGE_LENGTH } = require('../constants');
const {
  nextRaceInfoCache,
  sharedKey,
  weatherForecastCache,
} = require('../cache');
const { t } = require('../i18n');

async function handleNextRaceWeatherCommand(bot, chatId) {
  const nextRaceInfo = nextRaceInfoCache[sharedKey];

  if (!nextRaceInfo) {
    await bot
      .sendMessage(
        chatId,
        t('Next race information is currently unavailable.', chatId)
      )
      .catch((err) =>
        console.error('Error sending next race info unavailable message:', err)
      );

    return;
  }

  const qualifyingDate = new Date(nextRaceInfo.sessions.qualifying);
  const raceDate = new Date(nextRaceInfo.sessions.race);
  const isSprintWeekend = nextRaceInfo.weekendFormat === 'sprint';

  const sessions = [
    { key: 'qualifyingHourlyWeather', label: t('Qualifying', chatId), start: qualifyingDate },
    { key: 'raceHourlyWeather', label: t('Race', chatId), start: raceDate },
  ];

  if (isSprintWeekend) {
    const sprintQualiDate = new Date(nextRaceInfo.sessions.sprintQualifying);
    const sprintDate = new Date(nextRaceInfo.sessions.sprint);
    sessions.push({
      key: 'sprintQualifyingHourlyWeather',
      label: t('Sprint Qualifying', chatId),
      start: sprintQualiDate,
    });
    sessions.push({
      key: 'sprintHourlyWeather',
      label: t('Sprint', chatId),
      start: sprintDate,
    });
  }

  sessions.sort((a, b) => a.start - b.start);

  const nowRounded = new Date(Math.floor(Date.now() / (60 * 60 * 1000)) * 60 * 60 * 1000);

  const timesToFetch = [];
  sessions.forEach((s) => {
    s.hours = [
      s.start,
      new Date(s.start.getTime() + 60 * 60 * 1000),
      new Date(s.start.getTime() + 2 * 60 * 60 * 1000),
    ].filter((h) => h >= nowRounded);
    s.forecast = weatherForecastCache[s.key];
    timesToFetch.push(...s.hours);
  });

  const needFetch = sessions.some((s) => !s.forecast);
  if (needFetch) {
    try {
      const weatherForecastsMap = await getWeatherForecast(
        nextRaceInfo.location.lat,
        nextRaceInfo.location.long,
        ...timesToFetch
      );
      sessions.forEach((s) => {
        if (!s.forecast) {
          s.forecast = s.hours.map((h) => weatherForecastsMap[h.toISOString()]);
          weatherForecastCache[s.key] = s.forecast;
        }
      });
      await sendLogMessage(
        bot,
        `Weather forecast fetched for location: ${nextRaceInfo.location.locality}, ${nextRaceInfo.location.country}`
      );
    } catch (err) {
      await sendLogMessage(bot, `Weather API error: ${err.message}`);
    }
  }

  if (sessions.some((s) => !s.forecast)) {
    await bot
      .sendMessage(
        chatId,
        t('Next race information is currently unavailable.', chatId)
      )
      .catch((err) =>
        console.error('Error sending next race weather message:', err)
      );

    return;
  }

  let message = `*${t('Next Race Weather Forecast', chatId)}*\n\n`;
  message += `🏁 *${t('Race Name', chatId)}:* ${nextRaceInfo.raceName}\n`;
  message += `\n`;
  sessions.forEach((session) => {
    if (session.hours.length === 0) {
      return;
    }
    const { dateStr, timeStr } = formatDateTime(session.start, chatId);
    message += `*${session.label}* (${dateStr} ${timeStr})\n`;
    session.hours.forEach((hourTime, idx) => {
      const forecast = session.forecast[idx];
      const { timeStr: hTime } = formatDateTime(hourTime, chatId);
      message += `*${t('Hour', chatId)} ${hTime}*:\n`;
      message += `🌡️ ${t('Temp', chatId)}: ${forecast.temperature}°C\n`;
      message += `💧 ${t('Humidity', chatId)}: ${forecast.humidity}%\n`;
      message += `🌧️ ${t('Rain', chatId)}: ${forecast.precipitation}% (${forecast.precipitation_mm} ${t('mm', chatId)})\n`;
      message += `💨 ${t('Wind', chatId)}: ${forecast.wind} ${t('km/h', chatId)}\n\n`;
    });
  });

  if (message.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
    await bot
      .sendMessage(chatId, message.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH), {
        parse_mode: 'Markdown',
      })
      .catch((err) =>
        console.error('Error sending next race weather message:', err)
      );

    let remaining = message.slice(MAX_TELEGRAM_MESSAGE_LENGTH);
    while (remaining.length > 0) {
      const part = remaining.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH);
      remaining = remaining.slice(MAX_TELEGRAM_MESSAGE_LENGTH);
      await bot
        .sendMessage(chatId, part, { parse_mode: 'Markdown' })
        .catch((err) =>
          console.error('Error sending next race weather message:', err)
        );
    }
  } else {
    await bot
      .sendMessage(chatId, message, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending next race weather message:', err)
      );
  }
}

module.exports = { handleNextRaceWeatherCommand };
