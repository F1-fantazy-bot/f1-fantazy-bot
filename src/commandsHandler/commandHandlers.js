const {
  COMMAND_BEST_TEAMS,
  COMMAND_BEST_TEAM_SCENARIOS,
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
  COMMAND_NEXT_RACES,
  COMMAND_NEXT_RACE_WEATHER,
  COMMAND_BILLING_STATS,
  COMMAND_VERSION,
  COMMAND_MENU,
  COMMAND_SET_LANGUAGE,
  COMMAND_EXTRA_BOOST,
  COMMAND_LIMITLESS,
  COMMAND_WILDCARD,
  COMMAND_RESET_CHIP,
  COMMAND_FLOW,
  COMMAND_START,
  COMMAND_REPORT_BUG,
  COMMAND_LIST_USERS,
  COMMAND_SEND_MESSAGE_TO_USER,
  COMMAND_BROADCAST,
  COMMAND_SET_NICKNAME,
  COMMAND_UPLOAD_DRIVERS_PHOTO,
  COMMAND_UPLOAD_CONSTRUCTORS_PHOTO,
  COMMAND_SELECT_TEAM,
  COMMAND_SET_BEST_TEAM_RANKING,
  COMMAND_LIVE_SCORE,
  COMMAND_DEADLINE,
  COMMAND_FOLLOW_LEAGUE,
  COMMAND_UNFOLLOW_LEAGUE,
  COMMAND_LEADERBOARD,
  COMMAND_SELECT_TEAM_FROM_LEAGUE,
  COMMAND_UNFOLLOW_TEAM,
  COMMAND_TEAMS_TRACKER,
  COMMAND_LEAGUE_GRAPHS,
} = require('../constants');

const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleBestTeamScenariosMessage } = require('./bestTeamScenariosHandler');
const { handleChipsMessage } = require('./chipsHandler');
const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');
const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');
const { displayHelpMessage } = require('./helpHandler');
const { handleLoadSimulation } = require('./loadSimulationHandler');
const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');
const { handleNextRaceWeatherCommand } = require('./nextRaceWeatherHandler');
const { handleNextRacesCommand } = require('./nextRacesHandler');
const { sendPrintableCache } = require('./printCacheHandler');
const { resetCacheForChat } = require('./resetCacheHandler');
const { handleScrapingTrigger } = require('./scrapingTriggerHandler');
const { handleBillingStats } = require('./billingStatsHandler');
const { handleVersionCommand } = require('./versionHandler');
const { displayMenuMessage } = require('./menuHandler');
const { handleSetLanguage } = require('./setLanguageHandler');
const {
  handleSelectExtraBoost,
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
const { handleDeadlineCommand } = require('./deadlineHandler');
const { handleFollowLeagueCommand } = require('./followLeagueHandler');
const {
  handleUnfollowLeagueCommand,
} = require('./unfollowLeagueHandler');
const { handleLeaderboardCommand } = require('./leaderboardHandler');
const {
  handleSelectTeamFromLeagueCommand,
} = require('./selectTeamFromLeagueHandler');
const {
  handleUnfollowTeamCommand,
} = require('./unfollowTeamHandler');
const { handleLeagueGraphsCommand } = require('./leagueGraphHandler');
const { handleManageTrackingCommand } = require('./manageTrackingHandler');

// Mapping of command constants to their handler functions
const COMMAND_HANDLERS = {
  [COMMAND_BEST_TEAMS]: handleBestTeamsMessage,
  [COMMAND_BEST_TEAM_SCENARIOS]: handleBestTeamScenariosMessage,
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
  [COMMAND_NEXT_RACES]: handleNextRacesCommand,
  [COMMAND_NEXT_RACE_WEATHER]: handleNextRaceWeatherCommand,
  [COMMAND_BILLING_STATS]: handleBillingStats,
  [COMMAND_VERSION]: handleVersionCommand,
  [COMMAND_MENU]: displayMenuMessage,
  [COMMAND_SET_LANGUAGE]: handleSetLanguage,
  [COMMAND_EXTRA_BOOST]: handleSelectExtraBoost,
  [COMMAND_LIMITLESS]: handleSelectLimitless,
  [COMMAND_WILDCARD]: handleSelectWildcard,
  [COMMAND_RESET_CHIP]: handleResetChip,
  [COMMAND_FLOW]: handleFlowCommand,
  [COMMAND_START]: handleFlowCommand,
  [COMMAND_REPORT_BUG]: handleReportBugCommand,
  [COMMAND_LIST_USERS]: handleListUsersCommand,
  [COMMAND_SEND_MESSAGE_TO_USER]: handleSendMessageToUserCommand,
  [COMMAND_BROADCAST]: handleBroadcastCommand,
  [COMMAND_SET_NICKNAME]: handleSetNicknameCommand,
  [COMMAND_UPLOAD_DRIVERS_PHOTO]: handleUploadDriversPhotoCommand,
  [COMMAND_UPLOAD_CONSTRUCTORS_PHOTO]: handleUploadConstructorsPhotoCommand,
  [COMMAND_SELECT_TEAM]: handleSelectTeamCommand,
  [COMMAND_SET_BEST_TEAM_RANKING]: handleSetBestTeamRanking,
  [COMMAND_LIVE_SCORE]: handleLiveScoreCommand,
  [COMMAND_DEADLINE]: handleDeadlineCommand,
  [COMMAND_FOLLOW_LEAGUE]: handleFollowLeagueCommand,
  [COMMAND_UNFOLLOW_LEAGUE]: handleUnfollowLeagueCommand,
  [COMMAND_LEADERBOARD]: handleLeaderboardCommand,
  [COMMAND_SELECT_TEAM_FROM_LEAGUE]: handleSelectTeamFromLeagueCommand,
  [COMMAND_UNFOLLOW_TEAM]: handleUnfollowTeamCommand,
  [COMMAND_TEAMS_TRACKER]: handleManageTrackingCommand,
  [COMMAND_LEAGUE_GRAPHS]: handleLeagueGraphsCommand,
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
    command === COMMAND_BEST_TEAM_SCENARIOS ||
    command === COMMAND_CURRENT_TEAM_INFO ||
    command === COMMAND_NEXT_RACE_INFO ||
    command === COMMAND_NEXT_RACES ||
    command === COMMAND_NEXT_RACE_WEATHER
  ) {
    await handler(bot, chatId);
  } else {
    const subMsg = { ...msg, text: command };
    await handler(bot, subMsg);
  }
}

module.exports = { COMMAND_HANDLERS, executeCommand };
