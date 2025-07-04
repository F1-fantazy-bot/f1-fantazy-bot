const { isAdminMessage } = require('../utils');
const {
  MENU_CATEGORIES,
  MENU_ACTIONS,
  MENU_CALLBACK_TYPE,
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
} = require('../constants');

// Import command handlers directly to avoid circular dependency
const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleChipsMessage } = require('./chipsHandler');
const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');
const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');
const { displayHelpMessage } = require('./helpHandler');
const { handleLoadSimulation } = require('./loadSimulationHandler');
const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');
const { sendPrintableCache } = require('./printCacheHandler');
const { resetCacheForChat } = require('./resetCacheHandler');
const { handleScrapingTrigger } = require('./scrapingTriggerHandler');
const { handleBillingStats } = require('./billingStatsHandler');

// Map commands to their handler functions
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
  [COMMAND_BILLING_STATS]: handleBillingStats,
};

function buildKeyboard(items, buttonBuilder, itemsPerRow = 2) {
  const keyboard = [];

  for (let i = 0; i < items.length; i += itemsPerRow) {
    const row = [];

    // Add items to the row up to itemsPerRow limit
    for (let j = 0; j < itemsPerRow && i + j < items.length; j++) {
      const item = items[i + j];
      row.push(buttonBuilder(item));
    }

    keyboard.push(row);
  }

  return keyboard;
}

function buildMainMenuKeyboard(isAdmin) {
  // Filter visible categories
  const visibleCategories = Object.values(MENU_CATEGORIES).filter(
    (category) => {
      // Skip admin-only categories for non-admin users
      // Skip categories marked as hideFromMenu
      return !(category.adminOnly && !isAdmin) && !category.hideFromMenu;
    }
  );

  // Build category buttons (2 per row)
  const keyboard = buildKeyboard(
    visibleCategories,
    (category) => ({
      text: category.title,
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:${category.id}`,
    }),
    2
  );

  // Add direct help button
  keyboard.push([
    {
      text: '❓ Help',
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.HELP}`,
    },
  ]);

  return keyboard;
}

function buildCategoryMenuKeyboard(category, isAdmin) {
  // Filter visible commands
  const visibleCommands = category.commands.filter((command) => {
    // Skip admin-only commands for non-admin users
    return !(command.adminOnly && !isAdmin);
  });

  // Build command buttons (2 per row)
  const keyboard = buildKeyboard(
    visibleCommands,
    (command) => ({
      text: command.title,
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:${command.constant}`,
    }),
    2
  );

  // Add back button
  keyboard.push([
    {
      text: '⬅️ Back to Main Menu',
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.MAIN_MENU}`,
    },
  ]);

  return keyboard;
}

function buildMainMenuMessage() {
  const menuMessage = '🎯 *F1 Fantasy Bot Menu*\n\nChoose a category:';
  const tipMessage =
    menuMessage + `\n\n💡 *Tip:* Use ${COMMAND_HELP} for quick text-based help`;

  return tipMessage;
}

async function displayMenuMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);

  const message = buildMainMenuMessage();
  const keyboard = buildMainMenuKeyboard(isAdmin);

  await bot
    .sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    })
    .catch((err) => console.error('Error sending menu message:', err));
}

async function handleMenuCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const isAdmin = isAdminMessage({ chat: { id: chatId } });

  const [, action, data] = query.data.split(':');

  switch (action) {
    case MENU_ACTIONS.MAIN_MENU:
      await showMainMenu(bot, chatId, messageId, isAdmin);
      break;
    case MENU_ACTIONS.CATEGORY:
      await showCategoryMenu(bot, chatId, messageId, data, isAdmin);
      break;
    case MENU_ACTIONS.COMMAND:
      await executeCommand(bot, query, data);

      return; // Don't answer callback query here as command handlers might do it
    case MENU_ACTIONS.HELP:
      await executeHelpCommand(bot, query);

      return; // Don't answer callback query here
    default:
      await bot.answerCallbackQuery(query.id, {
        text: 'Unknown menu action',
        show_alert: true,
      });

      return;
  }

  await bot.answerCallbackQuery(query.id);
}

async function showMainMenu(bot, chatId, messageId, isAdmin) {
  const message = buildMainMenuMessage();
  const keyboard = buildMainMenuKeyboard(isAdmin);

  await bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

async function showCategoryMenu(bot, chatId, messageId, categoryId, isAdmin) {
  const category = Object.values(MENU_CATEGORIES).find(
    (cat) => cat.id === categoryId
  );

  if (!category) {
    console.error('Category not found:', categoryId);

    return;
  }

  const menuMessage = `${category.title}\n\n${category.description}\n\nChoose a command:`;
  const keyboard = buildCategoryMenuKeyboard(category, isAdmin);

  await bot.editMessageText(menuMessage, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

async function executeCommand(bot, query, command) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  // Create a message object for the command handlers
  const msg = {
    chat: { id: chatId },
    text: command,
    message_id: messageId,
  };

  // Find and execute the command handler
  const handler = COMMAND_HANDLERS[command];
  if (handler) {
    try {
      // Answer the callback query first
      await bot.answerCallbackQuery(query.id, {
        text: `Executing ${command}...`,
      });

      // Execute the command based on handler parameter patterns
      if (command === COMMAND_PRINT_CACHE || command === COMMAND_RESET_CACHE) {
        // Handlers that expect (chatId, bot) parameters
        await handler(chatId, bot);
      } else if (
        command === COMMAND_BEST_TEAMS ||
        command === COMMAND_CURRENT_TEAM_INFO ||
        command === COMMAND_NEXT_RACE_INFO
      ) {
        // Handlers that expect (bot, chatId) parameters
        await handler(bot, chatId);
      } else {
        // Handlers that expect (bot, msg) parameters
        await handler(bot, msg);
      }
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
      await bot.answerCallbackQuery(query.id, {
        text: 'Error executing command',
        show_alert: true,
      });
    }
  } else {
    await bot.answerCallbackQuery(query.id, {
      text: 'Command not found',
      show_alert: true,
    });
  }
}

async function executeHelpCommand(bot, query) {
  const chatId = query.message.chat.id;
  const mockMsg = {
    chat: { id: chatId },
    text: COMMAND_HELP,
  };

  try {
    await bot.answerCallbackQuery(query.id, {
      text: 'Showing help...',
    });
    await displayHelpMessage(bot, mockMsg);
  } catch (error) {
    console.error('Error executing help command:', error);
    await bot.answerCallbackQuery(query.id, {
      text: 'Error showing help',
      show_alert: true,
    });
  }
}

module.exports = {
  displayMenuMessage,
  handleMenuCallback,
};
