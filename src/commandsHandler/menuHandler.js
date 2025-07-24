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
  COMMAND_VERSION,
  COMMAND_SET_LANGUAGE,
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
const { handleVersionCommand } = require('./versionHandler');
const { handleSetLanguage } = require('./setLanguageHandler');
const { t } = require('../i18n');

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
  [COMMAND_VERSION]: handleVersionCommand,
  [COMMAND_SET_LANGUAGE]: handleSetLanguage,
};

async function displayMenuMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);

  const message = buildMainMenuMessage(chatId);
  const keyboard = buildMainMenuKeyboard(isAdmin, chatId);

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
        text: t('Unknown menu action', chatId),
        show_alert: true,
      });

      return;
  }

  await bot.answerCallbackQuery(query.id);
}

function buildMainMenuMessage(chatId) {
  const menuMessage = t('🎯 *F1 Fantasy Bot Menu*\n\nChoose a category:', chatId);
  const tipMessage =
    menuMessage + `\n\n💡 *${t('Tip:', chatId)}* ${t('Use {CMD} for quick text-based help', chatId, { CMD: COMMAND_HELP })}`;

  return tipMessage;
}

function buildMainMenuKeyboard(isAdmin, chatId) {
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
      text: t(category.title, chatId),
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.CATEGORY}:${category.id}`,
    }),
    2
  );

  // Add direct help button
  keyboard.push([
    {
      text: t('❓ Help', chatId),
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.HELP}`,
    },
  ]);

  return keyboard;
}

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

function buildCategoryMenuKeyboard(category, isAdmin, chatId) {
  // Filter visible commands
  const visibleCommands = category.commands.filter((command) => {
    // Skip admin-only commands for non-admin users
    return !(command.adminOnly && !isAdmin);
  });

  // Build command buttons (2 per row)
  const keyboard = buildKeyboard(
    visibleCommands,
    (command) => ({
      text: t(command.title, chatId),
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.COMMAND}:${command.constant}`,
    }),
    2
  );

  // Add back button
  keyboard.push([
    {
      text: t('⬅️ Back to Main Menu', chatId),
      callback_data: `${MENU_CALLBACK_TYPE}:${MENU_ACTIONS.MAIN_MENU}`,
    },
  ]);

  return keyboard;
}

async function showMainMenu(bot, chatId, messageId, isAdmin) {
  const message = buildMainMenuMessage(chatId);
  const keyboard = buildMainMenuKeyboard(isAdmin, chatId);

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

  const menuMessage = `${t(category.title, chatId)}\n\n${t(category.description, chatId)}\n\n${t('Choose a command:', chatId)}`;
  const keyboard = buildCategoryMenuKeyboard(category, isAdmin, chatId);

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
        text: t('Executing {CMD}...', chatId, { CMD: command }),
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
        text: t('Error executing command', chatId),
        show_alert: true,
      });
    }
  } else {
    await bot.answerCallbackQuery(query.id, {
      text: t('Command not found', chatId),
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
      text: t('Showing help...', chatId),
    });
    await displayHelpMessage(bot, mockMsg);
  } catch (error) {
    console.error('Error executing help command:', error);
    await bot.answerCallbackQuery(query.id, {
      text: t('Error showing help', chatId),
      show_alert: true,
    });
  }
}

module.exports = {
  displayMenuMessage,
  handleMenuCallback,
};
