const { validateJsonData } = require('../utils');
const azureStorageService = require('../azureStorageService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
} = require('../cache');
const { sendPrintableCache } = require('./printCacheHandler');

// Handles the case when the message text is JSON data
async function handleJsonMessage(bot, chatId, jsonData) {
  const parsedData = jsonData;

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
