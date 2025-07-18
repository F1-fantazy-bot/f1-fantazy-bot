const { sendLogMessage, validateJsonData } = require('../utils');
const azureStorageService = require('../azureStorageService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
} = require('../cache');
const { sendPrintableCache } = require('./printCacheHandler');

// Handles the case when the message text is JSON data
async function handleJsonMessage(bot, msg, chatId, jsonData) {
  let parsedData = jsonData;
  if (!parsedData) {
    try {
      parsedData = JSON.parse(msg.text);
    } catch (error) {
      await sendLogMessage(
        bot,
        `Failed to parse JSON data: ${msg.text}. Error: ${error.message}`
      );
      await bot
        .sendMessage(chatId, 'Invalid JSON format. Please send valid JSON.')
        .catch((err) => console.error('Error sending JSON error message:', err));

      return;
    }
  }

  if (!validateJsonData(bot, parsedData, chatId)) {
    return;
  }

  driversCache[chatId] = Object.fromEntries(
    parsedData.Drivers.map((driver) => [driver.DR, driver])
  );
  constructorsCache[chatId] = Object.fromEntries(
    parsedData.Constructors.map((constructor) => [constructor.CN, constructor])
  );
  currentTeamCache[chatId] = parsedData.CurrentTeam;
  await azureStorageService.saveUserTeam(bot, chatId, parsedData.CurrentTeam);
  delete bestTeamsCache[chatId];

  await sendPrintableCache(chatId, bot);
}

module.exports = { handleJsonMessage };
