const { sendLogMessage, sendErrorMessage, sendPhotoToUser } = require('../utils');
const { formatDateTime } = require('../utils/utils');
const { MAX_TELEGRAM_MESSAGE_LENGTH } = require('../constants');
const { getNextRaceInfo } = require('../cores/nextRaceInfoCore');
const { t, getLanguage } = require('../i18n');

async function handleNextRaceInfoCommand(bot, chatId) {
  const result = await getNextRaceInfo({
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

  const {
    raceName,
    circuitName,
    circuitImageUrl,
    location,
    weekendFormat,
    isSprintWeekend,
    sessions,
    historicalRaceStats,
    trackHistory,
    weather,
  } = result;

  const qualifyingDate = new Date(sessions.qualifying);
  const raceDate = new Date(sessions.race);
  const sprintQualifyingDate = isSprintWeekend
    ? new Date(sessions.sprintQualifying)
    : null;
  const sprintDate = isSprintWeekend ? new Date(sessions.sprint) : null;

  const { dateStr: qualifyingDateStr, timeStr: qualifyingTimeStr } =
    formatDateTime(qualifyingDate, chatId);
  const { dateStr: raceDateStr, timeStr: raceTimeStr } = formatDateTime(
    raceDate,
    chatId
  );

  let sprintQualifyingDateStr = '';
  let sprintQualifyingTimeStr = '';
  let sprintDateStr = '';
  let sprintTimeStr = '';
  if (isSprintWeekend) {
    ({ dateStr: sprintQualifyingDateStr, timeStr: sprintQualifyingTimeStr } =
      formatDateTime(sprintQualifyingDate, chatId));

    ({ dateStr: sprintDateStr, timeStr: sprintTimeStr } = formatDateTime(
      sprintDate,
      chatId
    ));
  }

  const {
    qualifyingWeather,
    raceWeather,
    sprintQualifyingWeather,
    sprintWeather,
  } = weather;

  let weatherSection = '';
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

  let message = `*${t('Next Race Information', chatId)}*\n\n`;
  message += `🏎️ *${t('Race Name', chatId)}:* ${raceName}\n`;
  message += `🏁 *${t('Track', chatId)}:* ${circuitName}\n`;
  message += `📍 *${t('Location', chatId)}:* ${location.locality}, ${location.country}\n`;
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
    weekendFormat.charAt(0).toUpperCase() + weekendFormat.slice(1),
    chatId
  );
  message += `📝 *${t('Weekend Format', chatId)}:* ${weekendFormatValue}\n\n`;
  message += weatherSection;

  message += `*${t('Historical Race Stats (Last Decade)', chatId)}:*\n`;
  if (historicalRaceStats && historicalRaceStats.length > 0) {
    historicalRaceStats
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
  if (Array.isArray(trackHistory) && trackHistory.length > 0) {
    const lang = getLanguage(chatId);
    const trackHistoryObj =
      trackHistory.find((h) => h.lang === lang) || trackHistory[0];

    if (trackHistoryObj && trackHistoryObj.text) {
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
    await sendPhotoToUser(bot, chatId, circuitImageUrl, {
      errorMessageToLog: 'Error sending circuit image',
    });
  }
}

module.exports = { handleNextRaceInfoCommand };
