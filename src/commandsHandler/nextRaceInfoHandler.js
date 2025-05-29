const { sendLogMessage } = require('../utils');
const { formatSessionDateTime } = require('../utils/utils');
const { getWeatherForecast } = require('../utils/weatherApi');
const {
  nextRaceInfoCache,
  sharedKey,
  weatherForecastCache,
} = require('../cache');

async function handleNextRaceInfoCommand(bot, chatId) {
  const nextRaceInfo = nextRaceInfoCache[sharedKey];

  if (!nextRaceInfo) {
    await bot
      .sendMessage(chatId, 'Next race information is currently unavailable.')
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
    formatSessionDateTime(qualifyingDate);
  const { dateStr: raceDateStr, timeStr: raceTimeStr } =
    formatSessionDateTime(raceDate);

  let sprintQualifyingDateStr = '',
    sprintQualifyingTimeStr = '';
  let sprintDateStr = '',
    sprintTimeStr = '';
  if (isSprintWeekend) {
    ({ dateStr: sprintQualifyingDateStr, timeStr: sprintQualifyingTimeStr } =
      formatSessionDateTime(sprintQualifyingDate));

    ({ dateStr: sprintDateStr, timeStr: sprintTimeStr } =
      formatSessionDateTime(sprintDate));
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
    weatherSection += '*Weather Forecast:*\n';
    if (isSprintWeekend) {
      weatherSection += `*Sprint Qualifying:*\n🌡️ Temp: ${sprintQualifyingWeather.temperature}°C\n🌧️ Rain: ${sprintQualifyingWeather.precipitation}%\n💨 Wind: ${sprintQualifyingWeather.wind} km/h\n`;
      weatherSection += `*Sprint:*\n🌡️ Temp: ${sprintWeather.temperature}°C\n🌧️ Rain: ${sprintWeather.precipitation}%\n💨 Wind: ${sprintWeather.wind} km/h\n`;
    }
    weatherSection += `*Qualifying:*\n🌡️ Temp: ${qualifyingWeather.temperature}°C\n🌧️ Rain: ${qualifyingWeather.precipitation}%\n💨 Wind: ${qualifyingWeather.wind} km/h\n`;
    weatherSection += `*Race:*\n🌡️ Temp: ${raceWeather.temperature}°C\n🌧️ Rain: ${raceWeather.precipitation}%\n💨 Wind: ${raceWeather.wind} km/h\n\n`;
  }

  // Create message with next race information
  let message = `*Next Race Information*\n\n`;
  message += `🏎️ *Race Name:* ${nextRaceInfo.raceName}\n`;
  message += `🏁 *Track:* ${nextRaceInfo.circuitName}\n`;
  message += `📍 *Location:* ${nextRaceInfo.location.locality}, ${nextRaceInfo.location.country}\n`;
  if (isSprintWeekend) {
    message += `📅 *Sprint Qualifying Date:* ${sprintQualifyingDateStr}\n`;
    message += `⏰ *Sprint Qualifying Time:* ${sprintQualifyingTimeStr}\n`;
    message += `📅 *Sprint Date:* ${sprintDateStr}\n`;
    message += `⏰ *Sprint Time:* ${sprintTimeStr}\n`;
  }
  message += `📅 *Qualifying Date:* ${qualifyingDateStr}\n`;
  message += `⏰ *Qualifying Time:* ${qualifyingTimeStr}\n`;
  message += `📅 *Race Date:* ${raceDateStr}\n`;
  message += `⏰ *Race Time:* ${raceTimeStr}\n`;
  message += `📝 *Weekend Format:* ${
    nextRaceInfo.weekendFormat.charAt(0).toUpperCase() +
    nextRaceInfo.weekendFormat.slice(1)
  }\n\n`;
  message += weatherSection;

  // Add historical data section
  message += '*Historical Race Stats (Last Decade):*\n';
  if (
    nextRaceInfo.historicalRaceStats &&
    nextRaceInfo.historicalRaceStats.length > 0
  ) {
    nextRaceInfo.historicalRaceStats
      .sort((a, b) => b.season - a.season)
      .forEach((data) => {
        message += `*${data.season}:*\n`;
        message += `🚀 Pole: ${data.polePosition} (${data.poleConstructor})\n`;
        message += `🏆 Winner: ${data.winner} (${data.constructor})\n`;
        message += `🥈 2nd: ${data.secondPlaceDriver} (${data.secondPlaceConstructor})\n`;
        message += `🥉 3rd: ${data.thirdPlaceDriver} (${data.thirdPlaceConstructor})\n`;
        message += `🏎️ Cars Finished: ${data.carsFinished}\n`;
        if (data.overtakes !== undefined) {
          message += `🔄 Overtakes: ${data.overtakes}\n`;
        }
        if (data.safetyCars !== undefined) {
          message += `⚠️🚓 Safety Cars: ${data.safetyCars}\n`;
        }
        if (data.safetyCars !== undefined) {
          message += `🚩 Red Flags: ${data.redFlags}\n`;
        }
        message += `\n`;
      });
  } else {
    message += 'No historical data available for this track.\n\n';
  }

  if (nextRaceInfo.trackHistory) {
    // Add track History section
    message += '*Track History:*\n';
    message += nextRaceInfo.trackHistory;
    message += `\n`;
  }

  await bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending next race info message:', err)
    );
}

module.exports = { handleNextRaceInfoCommand };
