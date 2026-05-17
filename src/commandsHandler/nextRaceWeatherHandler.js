const { sendLogMessage, sendErrorMessage } = require('../utils');
const { formatDateTime } = require('../utils/utils');
const { getRaceWeather } = require('../cores/raceWeatherCore');
const { t } = require('../i18n');

async function handleNextRaceWeatherCommand(bot, chatId) {
  const result = await getRaceWeather({
    onFetch: async ({ locality, country }) => {
      await sendLogMessage(
        bot,
        `Weather forecast fetched for location: ${locality}, ${country}`
      );
    },
    onError: async (err) => {
      await sendErrorMessage(bot, `Weather API error: ${err.message}`);
    },
  });

  if (result.status === 'unavailable') {
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

  const { raceName, circuitName, location, sessions } = result;

  let message = `*${t('Next Race Weather Forecast', chatId)}*\n\n`;
  message += `🏎️ *${t('Race Name', chatId)}:* ${raceName}\n`;
  message += `🏁 *${t('Track', chatId)}:* ${circuitName}\n`;
  message += `📍 *${t('Location', chatId)}:* ${location.locality}, ${location.country}\n\n`;
  sessions.forEach((session) => {
    if (session.hours.length === 0) {
      return;
    }
    const startsAt = new Date(session.startsAt);
    const { dateStr, timeStr } = formatDateTime(startsAt, chatId);
    message += `*${t(session.label, chatId)}* (${dateStr} ${timeStr})\n`;
    session.hours.forEach((hourIso, idx) => {
      const forecast = session.forecasts[idx];
      const { timeStr: hTime } = formatDateTime(new Date(hourIso), chatId);
      message += `*${t('Hour', chatId)} ${hTime}*:\n`;
      message += `🌡️ ${t('Temp', chatId)}: ${forecast.temperature}°C\n`;
      message += `💧 ${t('Humidity', chatId)}: ${forecast.humidity}%\n`;
      message += `☁️ ${t('Cloud Cover', chatId)}: ${forecast.cloudCover}%\n`;
      message += `🌧️ ${t('Rain', chatId)}: ${forecast.precipitation}% (${forecast.precipitation_mm} ${t('mm', chatId)})\n`;
      message += `💨 ${t('Wind', chatId)}: ${forecast.wind} ${t('km/h', chatId)}\n\n`;
    });
  });

  await bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending next race weather message:', err));
}

module.exports = { handleNextRaceWeatherCommand };
