const {
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO,
  COMMAND_CHIPS,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
  COMMAND_TRIGGER_SCRAPING,
  COMMAND_LOAD_SIMULATION,
  COMMAND_GET_CURRENT_SIMULATION,
  COMMAND_GET_BOTFATHER_COMMANDS,
  COMMAND_NEXT_RACE_INFO,
  COMMAND_NEXT_RACE_WEATHER,
  COMMAND_BILLING_STATS,
  COMMAND_VERSION,
  COMMAND_MENU,
  COMMAND_SET_LANGUAGE,
  COMMAND_EXTRA_DRS,
  COMMAND_LIMITLESS,
  COMMAND_WILDCARD,
  COMMAND_RESET_CHIP,
} = require('../constants');

const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleChipsMessage } = require('./chipsHandler');
const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');
const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');
const { displayHelpMessage } = require('./helpHandler');
const { handleLoadSimulation } = require('./loadSimulationHandler');
const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');
const { handleNextRaceWeatherCommand } = require('./nextRaceWeatherHandler');
const { sendPrintableCache } = require('./printCacheHandler');
const { resetCacheForChat } = require('./resetCacheHandler');
const { handleScrapingTrigger } = require('./scrapingTriggerHandler');
const { handleBillingStats } = require('./billingStatsHandler');
const { handleVersionCommand } = require('./versionHandler');
const { displayMenuMessage } = require('./menuHandler');
const { handleSetLanguage } = require('./setLanguageHandler');
const {
  handleSelectExtraDrs,
  handleSelectLimitless,
  handleSelectWildcard,
  handleResetChip,
} = require('./selectChipHandlers');

// Mapping of command constants to their handler functions
const COMMAND_HANDLERS = {
  [COMMAND_BEST_TEAMS]: handleBestTeamsMessage,
  [COMMAND_CURRENT_TEAM_INFO]: calcCurrentTeamInfo,
  [COMMAND_CHIPS]: handleChipsMessage,
  [COMMAND_PRINT_CACHE]: sendPrintableCache,
  [COMMAND_RESET_CACHE]: resetCacheForChat,
  [COMMAND_HELP]: displayHelpMessage,
  [COMMAND_TRIGGER_SCRAPING]: handleScrapingTrigger,
  [COMMAND_LOAD_SIMULATION]: handleLoadSimulation,
  [COMMAND_GET_CURRENT_SIMULATION]: handleGetCurrentSimulation,
  [COMMAND_GET_BOTFATHER_COMMANDS]: handleGetBotfatherCommands,
  [COMMAND_NEXT_RACE_INFO]: handleNextRaceInfoCommand,
  [COMMAND_NEXT_RACE_WEATHER]: handleNextRaceWeatherCommand,
  [COMMAND_BILLING_STATS]: handleBillingStats,
  [COMMAND_VERSION]: handleVersionCommand,
  [COMMAND_MENU]: displayMenuMessage,
  [COMMAND_SET_LANGUAGE]: handleSetLanguage,
  [COMMAND_EXTRA_DRS]: handleSelectExtraDrs,
  [COMMAND_LIMITLESS]: handleSelectLimitless,
  [COMMAND_WILDCARD]: handleSelectWildcard,
  [COMMAND_RESET_CHIP]: handleResetChip,
};

async function executeCommand(bot, msg, command) {
  const chatId = msg.chat.id;
  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    return;
  }

  if (command === COMMAND_PRINT_CACHE || command === COMMAND_RESET_CACHE) {
    await handler(chatId, bot);
  } else if (
    command === COMMAND_BEST_TEAMS ||
    command === COMMAND_CURRENT_TEAM_INFO ||
    command === COMMAND_NEXT_RACE_INFO ||
    command === COMMAND_NEXT_RACE_WEATHER
  ) {
    await handler(bot, chatId);
  } else {
    const subMsg = { ...msg, text: command };
    await handler(bot, subMsg);
  }
}

module.exports = { COMMAND_HANDLERS, executeCommand };
