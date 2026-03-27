const {
  KILZI_CHAT_ID,
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO,
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
  COMMAND_CHIPS,
  COMMAND_SET_LANGUAGE,
  COMMAND_FLOW,
  COMMAND_START,
  COMMAND_REPORT_BUG,
  COMMAND_LIST_USERS,
  COMMAND_SEND_MESSAGE_TO_USER,
  COMMAND_UPLOAD_DRIVERS_PHOTO,
  COMMAND_UPLOAD_CONSTRUCTORS_PHOTO,
  COMMAND_SET_BEST_TEAM_RANKING,
  COMMAND_LIVE_SCORE,
} = require('./constants');

jest.mock('openai', () => ({
  AzureOpenAI: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

// Mock all command handlers
const { handleNumberMessage } = require('./commandsHandler/numberInputHandler');
const { handleJsonMessage } = require('./commandsHandler/jsonInputHandler');
const {
  handleBestTeamsMessage,
} = require('./commandsHandler/bestTeamsHandler');
const {
  calcCurrentTeamInfo,
} = require('./commandsHandler/currentTeamInfoHandler');
const { handleChipsMessage } = require('./commandsHandler/chipsHandler');
const { sendPrintableCache } = require('./commandsHandler/printCacheHandler');
const { resetCacheForChat } = require('./commandsHandler/resetCacheHandler');
const { displayHelpMessage } = require('./commandsHandler/helpHandler');
const {
  handleGetCurrentSimulation,
} = require('./commandsHandler/getCurrentSimulationHandler');
const {
  handleLoadSimulation,
} = require('./commandsHandler/loadSimulationHandler');
const {
  handleScrapingTrigger,
} = require('./commandsHandler/scrapingTriggerHandler');
const {
  handleGetBotfatherCommands,
} = require('./commandsHandler/getBotfatherCommandsHandler');
const {
  handleNextRaceInfoCommand,
} = require('./commandsHandler/nextRaceInfoHandler');
const {
  handleNextRacesCommand,
} = require('./commandsHandler/nextRacesHandler');
const { handleNextRaceWeatherCommand } = require('./commandsHandler/nextRaceWeatherHandler');
const { displayMenuMessage } = require('./commandsHandler/menuHandler');
const { handleSetLanguage } = require('./commandsHandler/setLanguageHandler');
const { handleFlowCommand } = require('./commandsHandler/flowHandler');
const {
  handleReportBugCommand,
} = require('./commandsHandler/reportBugHandler');
const {
  handleListUsersCommand,
} = require('./commandsHandler/listUsersHandler');
const {
  handleSendMessageToUserCommand,
} = require('./commandsHandler/sendMessageToUserHandler');
const {
  handleUploadDriversPhotoCommand,
} = require('./commandsHandler/uploadDriversPhotoHandler');
const {
  handleUploadConstructorsPhotoCommand,
} = require('./commandsHandler/uploadConstructorsPhotoHandler');
const {
  handleSetBestTeamRanking,
} = require('./commandsHandler/setBestTeamRankingHandler');
const {
  handleLiveScoreCommand,
} = require('./commandsHandler/liveScoreHandler');

jest.mock('./commandsHandler/numberInputHandler');
jest.mock('./commandsHandler/jsonInputHandler');
jest.mock('./commandsHandler/bestTeamsHandler');
jest.mock('./commandsHandler/currentTeamInfoHandler');
jest.mock('./commandsHandler/chipsHandler');
jest.mock('./commandsHandler/printCacheHandler');
jest.mock('./commandsHandler/resetCacheHandler');
jest.mock('./commandsHandler/helpHandler');
jest.mock('./commandsHandler/getCurrentSimulationHandler');
jest.mock('./commandsHandler/loadSimulationHandler');
jest.mock('./commandsHandler/scrapingTriggerHandler');
jest.mock('./commandsHandler/getBotfatherCommandsHandler');
jest.mock('./commandsHandler/nextRaceInfoHandler');
jest.mock('./commandsHandler/nextRacesHandler');
jest.mock('./commandsHandler/nextRaceWeatherHandler');
jest.mock('./commandsHandler/menuHandler');
jest.mock('./commandsHandler/setLanguageHandler');
jest.mock('./commandsHandler/flowHandler');
jest.mock('./commandsHandler/reportBugHandler');
jest.mock('./commandsHandler/askHandler');
jest.mock('./commandsHandler/listUsersHandler');
jest.mock('./commandsHandler/sendMessageToUserHandler');
jest.mock('./commandsHandler/uploadDriversPhotoHandler');
jest.mock('./commandsHandler/uploadConstructorsPhotoHandler');
jest.mock('./commandsHandler/setBestTeamRankingHandler');
jest.mock('./commandsHandler/liveScoreHandler');

const { handleTextMessage } = require('./textMessageHandler');
const { handleAskCommand } = require('./commandsHandler/askHandler');

describe('handleTextMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('command routing', () => {
    it('should route number message to handleNumberMessage', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '5',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNumberMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID,
        '5'
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /best_teams command to handleBestTeamsMessage', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_BEST_TEAMS,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleBestTeamsMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /current_team_info command to calcCurrentTeamInfo', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_CURRENT_TEAM_INFO,
      };

      await handleTextMessage(botMock, msgMock);

      expect(calcCurrentTeamInfo).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /chips command to handleChipsMessage', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_CHIPS,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleChipsMessage).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });


    it('should route /set_best_team_ranking command to handleSetBestTeamRanking', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_SET_BEST_TEAM_RANKING,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleSetBestTeamRanking).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /live_score command to handleLiveScoreCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_LIVE_SCORE,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleLiveScoreCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /print_cache command to sendPrintableCache', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_PRINT_CACHE,
      };

      await handleTextMessage(botMock, msgMock);

      expect(sendPrintableCache).toHaveBeenCalledWith(KILZI_CHAT_ID, botMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /reset_cache command to resetCacheForChat', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_RESET_CACHE,
      };

      await handleTextMessage(botMock, msgMock);

      expect(resetCacheForChat).toHaveBeenCalledWith(KILZI_CHAT_ID, botMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /load_simulation command to handleLoadSimulation', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_LOAD_SIMULATION,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleLoadSimulation).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /help command to displayHelpMessage', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_HELP,
      };

      await handleTextMessage(botMock, msgMock);

      expect(displayHelpMessage).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /get_current_simulation command to handleGetCurrentSimulation', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_GET_CURRENT_SIMULATION,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleGetCurrentSimulation).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /trigger_scraping command to handleScrapingTrigger', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_TRIGGER_SCRAPING,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleScrapingTrigger).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /get_botfather_commands command to handleGetBotfatherCommands', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_GET_BOTFATHER_COMMANDS,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleGetBotfatherCommands).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /next_race_info command to handleNextRaceInfoCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_NEXT_RACE_INFO,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNextRaceInfoCommand).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /next_races command to handleNextRacesCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_NEXT_RACES,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNextRacesCommand).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /next_race_weather command to handleNextRaceWeatherCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_NEXT_RACE_WEATHER,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNextRaceWeatherCommand).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /lang command to handleSetLanguage', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_SET_LANGUAGE,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleSetLanguage).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /flow command to handleFlowCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_FLOW,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleFlowCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /start command to handleFlowCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_START,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleFlowCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /report_bug command to handleReportBugCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_REPORT_BUG,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleReportBugCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /list_users command to handleListUsersCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_LIST_USERS,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleListUsersCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /send_message_to_user command to handleSendMessageToUserCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_SEND_MESSAGE_TO_USER,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleSendMessageToUserCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /upload_drivers_photo command to handleUploadDriversPhotoCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_UPLOAD_DRIVERS_PHOTO,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleUploadDriversPhotoCommand).toHaveBeenCalledWith(
        botMock,
        msgMock,
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should route /upload_constructors_photo command to handleUploadConstructorsPhotoCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: COMMAND_UPLOAD_CONSTRUCTORS_PHOTO,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleUploadConstructorsPhotoCommand).toHaveBeenCalledWith(
        botMock,
        msgMock,
      );
      expect(handleJsonMessage).not.toHaveBeenCalled();
    });

    it('should handle unknown text via handleAskCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: 'some random text',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleAskCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
      expect(handleNumberMessage).not.toHaveBeenCalled();
      expect(handleBestTeamsMessage).not.toHaveBeenCalled();
    });

    it('should show menu for text with only a dot', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '.',
      };

      await handleTextMessage(botMock, msgMock);

      expect(displayMenuMessage).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleAskCommand).not.toHaveBeenCalled();
    });

    it('should route JSON text to handleJsonMessage', async () => {
      const jsonText = '{"key": "value"}';
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: jsonText,
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleJsonMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID,
        JSON.parse(jsonText)
      );
      expect(handleNumberMessage).not.toHaveBeenCalled();
    });
  });

  describe('number pattern matching', () => {
    it('should match single digit numbers', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '1',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNumberMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID,
        '1'
      );
    });

    it('should match multi-digit numbers', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '123',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNumberMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID,
        '123'
      );
    });

    it('should not match numbers with leading zeros as special case', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '01',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleNumberMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID,
        '01'
      );
    });

    it('should send free text with spaces to handleAskCommand', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '1 23',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleAskCommand).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
      expect(handleNumberMessage).not.toHaveBeenCalled();
    });

    it('should route decimal numbers as JSON text', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '1.5',
      };

      await handleTextMessage(botMock, msgMock);

      expect(handleJsonMessage).toHaveBeenCalledWith(
        botMock,
        KILZI_CHAT_ID,
        JSON.parse('1.5')
      );
      expect(displayMenuMessage).not.toHaveBeenCalled();
      expect(handleNumberMessage).not.toHaveBeenCalled();
    });
  });
});
