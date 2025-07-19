// Import all command handlers from the index file
const {
  handleNumberMessage,
  handleJsonMessage,
  handleBestTeamsMessage,
  calcCurrentTeamInfo,
  handleChipsMessage,
  sendPrintableCache,
  resetCacheForChat,
  displayHelpMessage,
  handleGetCurrentSimulation,
  handleLoadSimulation,
  handleScrapingTrigger,
  handleGetBotfatherCommands,
  handleNextRaceInfoCommand,
  handleBillingStats,
  displayMenuMessage,
  handleVersionCommand,
} = require('./commandsHandler');

// Import constants
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
  COMMAND_BILLING_STATS,
  COMMAND_VERSION,
  COMMAND_MENU,
} = require('./constants');

exports.handleTextMessage = async function (bot, msg) {
  const chatId = msg.chat.id;
  const textTrimmed = msg.text.trim();

  switch (true) {
    // Check if message text is a number and delegate to the number handler
    case /^\d+$/.test(textTrimmed):
      await handleNumberMessage(bot, chatId, textTrimmed);

      return;
    case msg.text === COMMAND_BEST_TEAMS:
      await handleBestTeamsMessage(bot, chatId);

      return;
    case msg.text === COMMAND_CURRENT_TEAM_INFO:
      return await calcCurrentTeamInfo(bot, chatId);
    case msg.text === COMMAND_CHIPS:
      return await handleChipsMessage(bot, msg);
    case msg.text === COMMAND_PRINT_CACHE:
      return await sendPrintableCache(chatId, bot);
    case msg.text === COMMAND_RESET_CACHE:
      return await resetCacheForChat(chatId, bot);
    case msg.text === COMMAND_LOAD_SIMULATION:
      return await handleLoadSimulation(bot, msg);
    case msg.text === COMMAND_HELP:
      return await displayHelpMessage(bot, msg);
    case msg.text === COMMAND_GET_CURRENT_SIMULATION:
      return await handleGetCurrentSimulation(bot, msg);
    case msg.text === COMMAND_TRIGGER_SCRAPING:
      return await handleScrapingTrigger(bot, msg);
    case msg.text === COMMAND_GET_BOTFATHER_COMMANDS:
      return await handleGetBotfatherCommands(bot, msg);
    case msg.text === COMMAND_NEXT_RACE_INFO:
      return await handleNextRaceInfoCommand(bot, chatId);
    case msg.text === COMMAND_BILLING_STATS:
      return await handleBillingStats(bot, msg);
    case msg.text === COMMAND_VERSION:
      return await handleVersionCommand(bot, msg);
    case msg.text === COMMAND_MENU:
      return await displayMenuMessage(bot, msg);
    default:
      try {
        const jsonData = JSON.parse(textTrimmed);
        await handleJsonMessage(bot, chatId, jsonData);
      } catch {
        await displayMenuMessage(bot, msg);
      }
      break;
  }
};
