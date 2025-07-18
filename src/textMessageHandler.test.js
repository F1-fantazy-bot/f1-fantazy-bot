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
  COMMAND_CHIPS,
} = require('./constants');

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
const { displayMenuMessage } = require('./commandsHandler/menuHandler');

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
jest.mock('./commandsHandler/menuHandler');

const { handleTextMessage } = require('./textMessageHandler');

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

    it('should show menu for unsupported text', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: 'some random text',
      };

      await handleTextMessage(botMock, msgMock);

      expect(displayMenuMessage).toHaveBeenCalledWith(botMock, msgMock);
      expect(handleJsonMessage).not.toHaveBeenCalled();
      expect(handleNumberMessage).not.toHaveBeenCalled();
      expect(handleBestTeamsMessage).not.toHaveBeenCalled();
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
        msgMock,
        KILZI_CHAT_ID
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

    it('should show menu when number has spaces', async () => {
      const msgMock = {
        chat: { id: KILZI_CHAT_ID },
        text: '1 23',
      };

      await handleTextMessage(botMock, msgMock);

      expect(displayMenuMessage).toHaveBeenCalledWith(botMock, msgMock);
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
        msgMock,
        KILZI_CHAT_ID
      );
      expect(displayMenuMessage).not.toHaveBeenCalled();
      expect(handleNumberMessage).not.toHaveBeenCalled();
    });
  });
});
