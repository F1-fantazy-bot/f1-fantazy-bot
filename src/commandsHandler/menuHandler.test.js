const { displayMenuMessage, handleMenuCallback } = require('./menuHandler');
const { MENU_CALLBACK_TYPE, MENU_ACTIONS } = require('../constants');

// Mock the utils function
jest.mock('../utils', () => ({
  isAdminMessage: jest.fn(),
}));

// Mock all command handlers individually
jest.mock('./bestTeamsHandler', () => ({
  handleBestTeamsMessage: jest.fn(),
}));
jest.mock('./chipsHandler', () => ({
  handleChipsMessage: jest.fn(),
}));
jest.mock('./currentTeamInfoHandler', () => ({
  calcCurrentTeamInfo: jest.fn(),
}));
jest.mock('./getBotfatherCommandsHandler', () => ({
  handleGetBotfatherCommands: jest.fn(),
}));
jest.mock('./getCurrentSimulationHandler', () => ({
  handleGetCurrentSimulation: jest.fn(),
}));
jest.mock('./helpHandler', () => ({
  displayHelpMessage: jest.fn(),
}));
jest.mock('./loadSimulationHandler', () => ({
  handleLoadSimulation: jest.fn(),
}));
jest.mock('./nextRaceInfoHandler', () => ({
  handleNextRaceInfoCommand: jest.fn(),
}));
jest.mock('./printCacheHandler', () => ({
  sendPrintableCache: jest.fn(),
}));
jest.mock('./resetCacheHandler', () => ({
  resetCacheForChat: jest.fn(),
}));
jest.mock('./scrapingTriggerHandler', () => ({
  handleScrapingTrigger: jest.fn(),
}));
jest.mock('./billingStatsHandler', () => ({
  handleBillingStats: jest.fn(),
}));
jest.mock('./versionHandler', () => ({
  handleVersionCommand: jest.fn(),
}));

const { isAdminMessage } = require('../utils');

// Import the mocked handlers
const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { displayHelpMessage } = require('./helpHandler');
const { sendPrintableCache } = require('./printCacheHandler');
const { resetCacheForChat } = require('./resetCacheHandler');
const { handleVersionCommand } = require('./versionHandler');

describe('Menu Handler', () => {
  let mockBot;
  let mockMsg;
  let mockQuery;

  beforeEach(() => {
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
    };

    mockMsg = {
      chat: { id: 123 },
      text: '/menu',
    };

    mockQuery = {
      id: 'callback_query_id',
      data: '',
      message: {
        chat: { id: 123 },
        message_id: 456,
      },
    };

    jest.clearAllMocks();
  });

  describe('displayMenuMessage', () => {
    it('should display menu for regular user', async () => {
      isAdminMessage.mockReturnValue(false);

      await displayMenuMessage(mockBot, mockMsg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('🎯 *F1 Fantasy Bot Menu*'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '🏎️ Team Management',
                  callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:team_management`,
                }),
              ]),
              expect.arrayContaining([
                expect.objectContaining({
                  text: '📊 Analysis & Stats',
                  callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:analysis_stats`,
                }),
              ]),
              expect.arrayContaining([
                expect.objectContaining({
                  text: '🔧 Utilities',
                  callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:utilities`,
                }),
              ]),
              expect.arrayContaining([
                expect.objectContaining({
                  text: '❓ Help',
                  callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.HELP}`,
                }),
              ]),
            ]),
          }),
        })
      );
    });

    it('should display menu with admin commands for admin user', async () => {
      isAdminMessage.mockReturnValue(true);

      await displayMenuMessage(mockBot, mockMsg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('🎯 *F1 Fantasy Bot Menu*'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '👤 Admin Commands',
                  callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:admin_commands`,
                }),
              ]),
            ]),
          }),
        })
      );
    });

    it('should handle sendMessage error gracefully', async () => {
      isAdminMessage.mockReturnValue(false);
      mockBot.sendMessage.mockRejectedValue(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await displayMenuMessage(mockBot, mockMsg);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error sending menu message:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleMenuCallback', () => {
    it('should handle main menu callback', async () => {
      isAdminMessage.mockReturnValue(false);
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.MAIN_MENU}`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('🎯 *F1 Fantasy Bot Menu*'),
        expect.objectContaining({
          chat_id: 123,
          message_id: 456,
          parse_mode: 'Markdown',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        })
      );
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id'
      );
    });

    it('should handle category callback', async () => {
      isAdminMessage.mockReturnValue(false);
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:team_management`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('🏎️ Team Management'),
        expect.objectContaining({
          chat_id: 123,
          message_id: 456,
          parse_mode: 'Markdown',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '🏆 Best Teams',
                }),
              ]),
              expect.arrayContaining([
                expect.objectContaining({
                  text: '⬅️ Back to Main Menu',
                }),
              ]),
            ]),
          }),
        })
      );
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id'
      );
    });

    it('should handle help callback', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.HELP}`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Showing help...',
        }
      );
      expect(displayHelpMessage).toHaveBeenCalledWith(
        mockBot,
        expect.objectContaining({
          chat: { id: 123 },
          text: '/help',
        })
      );
    });

    it('should handle command callback', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:/best_teams`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Executing /best_teams...',
        }
      );
      expect(handleBestTeamsMessage).toHaveBeenCalledWith(mockBot, 123);
    });

    it('should handle print cache command callback', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:/print_cache`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Executing /print_cache...',
        }
      );
      expect(sendPrintableCache).toHaveBeenCalledWith(123, mockBot);
    });

    it('should handle reset cache command callback', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:/reset_cache`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Executing /reset_cache...',
        }
      );
      expect(resetCacheForChat).toHaveBeenCalledWith(123, mockBot);
    });

    it('should handle version command callback', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:/version`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('callback_query_id', {
        text: 'Executing /version...',
      });
      expect(handleVersionCommand).toHaveBeenCalledWith(
        mockBot,
        expect.objectContaining({ chat: { id: 123 }, text: '/version', message_id: 456 })
      );
    });

    it('should handle unknown callback action', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:unknown_action`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Unknown menu action',
          show_alert: true,
        }
      );
    });

    it('should handle unknown category', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:unknown_category`;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleMenuCallback(mockBot, mockQuery);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Category not found:',
        'unknown_category'
      );
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id'
      );
      consoleSpy.mockRestore();
    });

    it('should handle command execution error', async () => {
      handleBestTeamsMessage.mockRejectedValue(new Error('Command error'));
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:/best_teams`;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleMenuCallback(mockBot, mockQuery);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error executing command /best_teams:',
        expect.any(Error)
      );
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Error executing command',
          show_alert: true,
        }
      );
      consoleSpy.mockRestore();
    });

    it('should handle help command execution error', async () => {
      displayHelpMessage.mockRejectedValue(new Error('Help error'));
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.HELP}`;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleMenuCallback(mockBot, mockQuery);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error executing help command:',
        expect.any(Error)
      );
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Error showing help',
          show_alert: true,
        }
      );
      consoleSpy.mockRestore();
    });

    it('should handle unknown command', async () => {
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:/unknown_command`;

      await handleMenuCallback(mockBot, mockQuery);

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith(
        'callback_query_id',
        {
          text: 'Command not found',
          show_alert: true,
        }
      );
    });

    it('should filter admin commands for regular users in category view', async () => {
      isAdminMessage.mockReturnValue(false);
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:team_management`;

      await handleMenuCallback(mockBot, mockQuery);

      const editCall = mockBot.editMessageText.mock.calls[0][1];
      const keyboard = editCall.reply_markup.inline_keyboard;

      // Should not include Load Simulation button for regular users (it's now in admin commands)
      const hasLoadSimulation = keyboard.some((row) =>
        row.some((button) => button.text === '📋 Load Simulation')
      );
      expect(hasLoadSimulation).toBe(false);
    });

    it('should include admin commands for admin users in category view', async () => {
      isAdminMessage.mockReturnValue(true);
      mockQuery.data = `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:admin_commands`;

      await handleMenuCallback(mockBot, mockQuery);

      const editCall = mockBot.editMessageText.mock.calls[0][1];
      const keyboard = editCall.reply_markup.inline_keyboard;

      // Should include Load Simulation button for admin users in admin commands category
      const hasLoadSimulation = keyboard.some((row) =>
        row.some((button) => button.text === '📋 Load Simulation')
      );
      expect(hasLoadSimulation).toBe(true);
    });
  });
});
