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
  const hasDriversData = Array.isArray(jsonData.Drivers);
  const hasConstructorsData = Array.isArray(jsonData.Constructors);
  const hasCurrentTeam = !!jsonData.CurrentTeam;

  if (hasDriversData || hasConstructorsData) {
    if (!(await validateJsonData(bot, jsonData, chatId))) {
      return;
    }

    driversCache[chatId] = Object.fromEntries(
      jsonData.Drivers.map((driver) => [driver.DR, driver])
    );
    constructorsCache[chatId] = Object.fromEntries(
      jsonData.Constructors.map((constructor) => [constructor.CN, constructor])
    );
    currentTeamCache[chatId] = jsonData.CurrentTeam;
  } else if (hasCurrentTeam) {
    if (
      !(await validateJsonData(bot, jsonData, chatId, true, false))
    ) {
      return;
    }

    currentTeamCache[chatId] = jsonData.CurrentTeam;
  } else if (!(await validateJsonData(bot, jsonData, chatId))) {
    return;
  }

  await azureStorageService.saveUserTeam(bot, chatId, jsonData.CurrentTeam);
  delete bestTeamsCache[chatId];

  await sendPrintableCache(chatId, bot);
}

module.exports = { handleJsonMessage };
