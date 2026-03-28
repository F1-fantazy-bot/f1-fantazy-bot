// Export all command handler functions from a central index file
const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleBestTeamScenariosMessage } = require('./bestTeamScenariosHandler');
const { handleChipsMessage } = require('./chipsHandler');
const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');
const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');
const { displayHelpMessage } = require('./helpHandler');
const { handleJsonMessage } = require('./jsonInputHandler');
const { handleLoadSimulation } = require('./loadSimulationHandler');
const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');
const { handleNextRaceWeatherCommand } = require('./nextRaceWeatherHandler');
const { handleNextRacesCommand } = require('./nextRacesHandler');
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
const { handleFlowCommand } = require('./flowHandler');
const { handleReportBugCommand } = require('./reportBugHandler');
const { handleListUsersCommand } = require('./listUsersHandler');
const {
  handleSendMessageToUserCommand,
} = require('./sendMessageToUserHandler');
const { handleBroadcastCommand } = require('./broadcastHandler');
const { handleSetNicknameCommand } = require('./setNicknameHandler');
const { handleUploadDriversPhotoCommand } = require('./uploadDriversPhotoHandler');
const {
  handleUploadConstructorsPhotoCommand,
} = require('./uploadConstructorsPhotoHandler');
const { handleSelectTeamCommand } = require('./selectTeamHandler');
const { handleSetBestTeamRanking } = require('./setBestTeamRankingHandler');
const { handleLiveScoreCommand } = require('./liveScoreHandler');

module.exports = {
  handleBestTeamsMessage,
  handleBestTeamScenariosMessage,
  handleChipsMessage,
  calcCurrentTeamInfo,
  handleGetBotfatherCommands,
  handleGetCurrentSimulation,
  displayHelpMessage,
  handleJsonMessage,
  handleLoadSimulation,
  handleNextRaceInfoCommand,
  handleNextRaceWeatherCommand,
  handleNextRacesCommand,
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
  handleFlowCommand,
  handleReportBugCommand,
  handleListUsersCommand,
  handleSendMessageToUserCommand,
  handleBroadcastCommand,
  handleSetNicknameCommand,
  handleUploadDriversPhotoCommand,
  handleUploadConstructorsPhotoCommand,
  handleSelectTeamCommand,
  handleSetBestTeamRanking,
  handleLiveScoreCommand,
};
