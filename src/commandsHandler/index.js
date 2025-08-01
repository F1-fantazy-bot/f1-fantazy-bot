// Export all command handler functions from a central index file
const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleChipsMessage } = require('./chipsHandler');
const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');
const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');
const { displayHelpMessage } = require('./helpHandler');
const { handleJsonMessage } = require('./jsonInputHandler');
const { handleLoadSimulation } = require('./loadSimulationHandler');
const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');
const { handleNextRaceWeatherCommand } = require('./nextRaceWeatherHandler');
const { handleNumberMessage } = require('./numberInputHandler');
const { sendPrintableCache } = require('./printCacheHandler');
const { resetCacheForChat } = require('./resetCacheHandler');
const { handleScrapingTrigger } = require('./scrapingTriggerHandler');
const { handleBillingStats } = require('./billingStatsHandler');
const { displayMenuMessage } = require('./menuHandler');
const { handleVersionCommand } = require('./versionHandler');
const { handleSetLanguage } = require('./setLanguageHandler');
const { handleAskCommand } = require('./askHandler');
const {
  handleSelectExtraDrs,
  handleSelectLimitless,
  handleSelectWildcard,
  handleResetChip,
} = require('./selectChipHandlers');

module.exports = {
  handleBestTeamsMessage,
  handleChipsMessage,
  calcCurrentTeamInfo,
  handleGetBotfatherCommands,
  handleGetCurrentSimulation,
  displayHelpMessage,
  handleJsonMessage,
  handleLoadSimulation,
  handleNextRaceInfoCommand,
  handleNextRaceWeatherCommand,
  handleNumberMessage,
  sendPrintableCache,
  resetCacheForChat,
  handleScrapingTrigger,
  handleBillingStats,
  displayMenuMessage,
  handleVersionCommand,
  handleSetLanguage,
  handleAskCommand,
  handleSelectExtraDrs,
  handleSelectLimitless,
  handleSelectWildcard,
  handleResetChip,
};
