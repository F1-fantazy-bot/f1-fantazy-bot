const { isAdminMessage } = require('../utils');
const { MENU_CATEGORIES, COMMAND_BEST_TEAMS } = require('../constants');
const { t } = require('../i18n');

async function displayHelpMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);

  let helpMessage = `*${t('F1 Fantasy Bot - Available Commands', chatId)}*\n\n`;

  // Add each menu category section in their natural order
  Object.values(MENU_CATEGORIES).forEach((category) => {
    const categorySection = buildCategoryHelpSection(category, isAdmin, chatId);
    if (categorySection) {
      helpMessage += categorySection;
    }
  });

  // Add other messages section
  helpMessage += buildOtherMessagesSection(chatId);

  await bot
    .sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending help message:', err));

  return;
}

/**
 * Builds help text for a specific menu category
 * @param {Object} category - The menu category object
 * @param {boolean} isAdmin - Whether the user is an admin
 * @returns {string} Formatted help text for the category
 */
function buildCategoryHelpSection(category, isAdmin, chatId) {
  // Skip admin-only categories for non-admin users
  if (category.adminOnly && !isAdmin) {
    return '';
  }

  let categorySection = `${t(category.title, chatId)}\n`;

  // Filter visible commands for this category
  const visibleCommands = category.commands.filter((command) => {
    return !(command.adminOnly && !isAdmin);
  });

  visibleCommands.forEach((command) => {
    categorySection += `${command.constant.replace(/_/g, '\\_')} - ${t(
      command.description,
      chatId
    )}\n`;
  });

  return categorySection + '\n';
}

/**
 * Builds the "Other Messages" section
 * @returns {string} Formatted text for other message types
 */
function buildOtherMessagesSection(chatId) {
  return (
    `*${t('Other Messages', chatId)}:*\n` +
    `${t('Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.', chatId)}\n` +
    `${t('Send valid JSON data to update your drivers, constructors, and current team cache.', chatId)}\n` +
    `${t(
      'Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using {CMD}).',
      chatId,
      { CMD: COMMAND_BEST_TEAMS.replace(/_/g, '\\_') }
    )}`
  );
}

module.exports = { displayHelpMessage };
