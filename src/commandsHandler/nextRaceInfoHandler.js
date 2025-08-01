const { sendLogMessage } = require('../utils');
const { formatDateTime } = require('../utils/utils');
const { getWeatherForecast } = require('../utils/weatherApi');
const { MAX_TELEGRAM_MESSAGE_LENGTH } = require('../constants');
const {
  nextRaceInfoCache,
  sharedKey,
  weatherForecastCache,
} = require('../cache');
const { t, getLanguage } = require('../i18n');

async function handleNextRaceInfoCommand(bot, chatId) {
  const nextRaceInfo = nextRaceInfoCache[sharedKey];
  const { circuitImageUrl } = nextRaceInfo || {};

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
  // Prepare session dates
  const raceDate = new Date(nextRaceInfo.sessions.race);
  const qualifyingDate = new Date(nextRaceInfo.sessions.qualifying);
  const isSprintWeekend = nextRaceInfo.weekendFormat === 'sprint';

  // If sprint weekend, get sprint session dates
  let sprintQualifyingDate = null;
  let sprintDate = null;
  if (isSprintWeekend) {
    sprintQualifyingDate = new Date(nextRaceInfo.sessions.sprintQualifying);
    sprintDate = new Date(nextRaceInfo.sessions.sprint);
  }

  // Format session dates and times
  const { dateStr: qualifyingDateStr, timeStr: qualifyingTimeStr } =
    formatDateTime(qualifyingDate, chatId);
  const { dateStr: raceDateStr, timeStr: raceTimeStr } =
    formatDateTime(raceDate, chatId);

  let sprintQualifyingDateStr = '',
    sprintQualifyingTimeStr = '';
  let sprintDateStr = '',
    sprintTimeStr = '';
  if (isSprintWeekend) {
    ({ dateStr: sprintQualifyingDateStr, timeStr: sprintQualifyingTimeStr } =
      formatDateTime(sprintQualifyingDate, chatId));

    ({ dateStr: sprintDateStr, timeStr: sprintTimeStr } =
      formatDateTime(sprintDate, chatId));
  }

  // Prepare array of dates for weather API
  const datesForWeatherApi = [];
  datesForWeatherApi.push(qualifyingDate, raceDate);
  if (isSprintWeekend) {
    datesForWeatherApi.push(sprintQualifyingDate, sprintDate);
  }

  // Weather forecast section
  let weatherSection = '';
  let sprintQualifyingWeather, sprintWeather, qualifyingWeather, raceWeather;
  const cachedWeatherData = weatherForecastCache;
  if (cachedWeatherData && Object.keys(cachedWeatherData).length > 0) {
    qualifyingWeather = cachedWeatherData.qualifyingWeather;
    raceWeather = cachedWeatherData.raceWeather;
    if (isSprintWeekend) {
      sprintQualifyingWeather = cachedWeatherData.sprintQualifyingWeather;
      sprintWeather = cachedWeatherData.sprintWeather;
    }
  } else {
    try {
      const weatherForecastsMap = await getWeatherForecast(
        nextRaceInfo.location.lat,
        nextRaceInfo.location.long,
        ...datesForWeatherApi
      );
      qualifyingWeather = weatherForecastsMap[qualifyingDate.toISOString()];
      raceWeather = weatherForecastsMap[raceDate.toISOString()];
      weatherForecastCache.qualifyingWeather = qualifyingWeather;
      weatherForecastCache.raceWeather = raceWeather;

      if (isSprintWeekend) {
        sprintQualifyingWeather =
          weatherForecastsMap[sprintQualifyingDate.toISOString()];
        sprintWeather = weatherForecastsMap[sprintDate.toISOString()];
        weatherForecastCache.sprintQualifyingWeather = sprintQualifyingWeather;
        weatherForecastCache.sprintWeather = sprintWeather;
      }

      await sendLogMessage(
        bot,
        `Weather forecast fetched for location: ${nextRaceInfo.location.locality}, ${nextRaceInfo.location.country}`
      );
    } catch (err) {
      await sendLogMessage(bot, `Weather API error: ${err.message}`);
    }
  }

  // Build weather section
  if (qualifyingWeather && raceWeather) {
    weatherSection += `*${t('Weather Forecast', chatId)}:*\n`;
    if (isSprintWeekend) {
      weatherSection += `*${t('Sprint Qualifying', chatId)}:*\n🌡️ ${t('Temp', chatId)}: ${
        sprintQualifyingWeather.temperature
      }°C\n🌧️ ${t('Rain', chatId)}: ${sprintQualifyingWeather.precipitation}%\n💨 ${t('Wind', chatId)}: ${
        sprintQualifyingWeather.wind
      } ${t('km/h', chatId)}\n`;
      weatherSection += `*${t('Sprint', chatId)}:*\n🌡️ ${t('Temp', chatId)}: ${
        sprintWeather.temperature
      }°C\n🌧️ ${t('Rain', chatId)}: ${sprintWeather.precipitation}%\n💨 ${t('Wind', chatId)}: ${
        sprintWeather.wind
      } ${t('km/h', chatId)}\n`;
    }
    weatherSection += `*${t('Qualifying', chatId)}:*\n🌡️ ${t('Temp', chatId)}: ${
      qualifyingWeather.temperature
    }°C\n🌧️ ${t('Rain', chatId)}: ${qualifyingWeather.precipitation}%\n💨 ${t('Wind', chatId)}: ${
      qualifyingWeather.wind
    } ${t('km/h', chatId)}\n`;
    weatherSection += `*${t('Race', chatId)}:*\n🌡️ ${t('Temp', chatId)}: ${
      raceWeather.temperature
    }°C\n🌧️ ${t('Rain', chatId)}: ${raceWeather.precipitation}%\n💨 ${t('Wind', chatId)}: ${
      raceWeather.wind
    } ${t('km/h', chatId)}\n\n`;
  }

  // Create message with next race information
  let message = `*${t('Next Race Information', chatId)}*\n\n`;
  message += `🏎️ *${t('Race Name', chatId)}:* ${nextRaceInfo.raceName}\n`;
  message += `🏁 *${t('Track', chatId)}:* ${nextRaceInfo.circuitName}\n`;
  message += `📍 *${t('Location', chatId)}:* ${
    nextRaceInfo.location.locality
  }, ${nextRaceInfo.location.country}\n`;
  if (isSprintWeekend) {
    message += `📅 *${t(
      'Sprint Qualifying Date',
      chatId
    )}:* ${sprintQualifyingDateStr}\n`;
    message += `⏰ *${t(
      'Sprint Qualifying Time',
      chatId
    )}:* ${sprintQualifyingTimeStr}\n`;
    message += `📅 *${t('Sprint Date', chatId)}:* ${sprintDateStr}\n`;
    message += `⏰ *${t('Sprint Time', chatId)}:* ${sprintTimeStr}\n`;
  }
  message += `📅 *${t('Qualifying Date', chatId)}:* ${qualifyingDateStr}\n`;
  message += `⏰ *${t('Qualifying Time', chatId)}:* ${qualifyingTimeStr}\n`;
  message += `📅 *${t('Race Date', chatId)}:* ${raceDateStr}\n`;
  message += `⏰ *${t('Race Time', chatId)}:* ${raceTimeStr}\n`;
  const weekendFormatValue = t(
    nextRaceInfo.weekendFormat.charAt(0).toUpperCase() +
      nextRaceInfo.weekendFormat.slice(1),
    chatId
  );
  message += `📝 *${t('Weekend Format', chatId)}:* ${weekendFormatValue}\n\n`;
  message += weatherSection;

  // Add historical data section
  message += `*${t('Historical Race Stats (Last Decade)', chatId)}:*\n`;
  if (
    nextRaceInfo.historicalRaceStats &&
    nextRaceInfo.historicalRaceStats.length > 0
  ) {
    nextRaceInfo.historicalRaceStats
      .sort((a, b) => b.season - a.season)
      .forEach((data) => {
        message += `*${data.season}:*\n`;
        message += `🚀 ${t('Pole', chatId)}: ${data.polePosition} (${
          data.poleConstructor
        })\n`;
        message += `🏆 ${t('Winner', chatId)}: ${data.winner} (${
          data.constructor
        })\n`;
        message += `🥈 ${t('2nd', chatId)}: ${data.secondPlaceDriver} (${
          data.secondPlaceConstructor
        })\n`;
        message += `🥉 ${t('3rd', chatId)}: ${data.thirdPlaceDriver} (${
          data.thirdPlaceConstructor
        })\n`;
        message += `🏎️ ${t('Cars Finished', chatId)}: ${data.carsFinished}\n`;
        if (data.overtakes !== undefined) {
          message += `🔄 ${t('Overtakes', chatId)}: ${data.overtakes}\n`;
        }
        if (data.safetyCars !== undefined) {
          message += `⚠️🚓 ${t('Safety Cars', chatId)}: ${data.safetyCars}\n`;
        }
        if (data.redFlags !== undefined) {
          message += `🚩 ${t('Red Flags', chatId)}: ${data.redFlags}\n`;
        }
        message += `\n`;
      });
  } else {
    message += `${t(
      'No historical data available for this track.',
      chatId
    )}\n\n`;
  }

  let trackHistoryMessage = '';
  if (Array.isArray(nextRaceInfo.trackHistory)) {
    const lang = getLanguage(chatId);
    const trackHistoryObj =
      nextRaceInfo.trackHistory.find((h) => h.lang === lang) ||
      nextRaceInfo.trackHistory[0];

    if (trackHistoryObj && trackHistoryObj.text) {
      // Add track History section
      trackHistoryMessage += `*${t('Track History', chatId)}:*\n`;
      trackHistoryMessage += trackHistoryObj.text;
      trackHistoryMessage += `\n`;
    }
  }

  if (
    message.length + trackHistoryMessage.length >
    MAX_TELEGRAM_MESSAGE_LENGTH
  ) {
    await bot
      .sendMessage(chatId, message, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending next race info message:', err)
      );

    await bot
      .sendMessage(chatId, trackHistoryMessage, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending track history message:', err)
      );
  } else {
    await bot
      .sendMessage(chatId, message + trackHistoryMessage, {
        parse_mode: 'Markdown',
      })
      .catch((err) =>
        console.error('Error sending next race info message:', err)
      );
  }

  if (circuitImageUrl) {
    await bot
      .sendPhoto(chatId, circuitImageUrl)
      .catch((err) =>
        console.error('Error sending circuit image:', err)
      );
  }
}

module.exports = { handleNextRaceInfoCommand };
