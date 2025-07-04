const { isAdminMessage } = require('../utils');
const { MENU_CATEGORIES, COMMAND_BEST_TEAMS } = require('../constants');

async function displayHelpMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);

  let helpMessage = '*F1 Fantasy Bot - Available Commands*\n\n';

  // Add each menu category section in their natural order
  Object.values(MENU_CATEGORIES).forEach((category) => {
    const categorySection = buildCategoryHelpSection(category, isAdmin);
    if (categorySection) {
      helpMessage += categorySection;
    }
  });

  // Add other messages section
  helpMessage += buildOtherMessagesSection();

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
function buildCategoryHelpSection(category, isAdmin) {
  // Skip admin-only categories for non-admin users
  if (category.adminOnly && !isAdmin) {
    return '';
  }

  let categorySection = `${category.title}\n`;

  // Filter visible commands for this category
  const visibleCommands = category.commands.filter((command) => {
    return !(command.adminOnly && !isAdmin);
  });

  visibleCommands.forEach((command) => {
    categorySection += `${command.constant.replace(/_/g, '\\_')} - ${
      command.description
    }\n`;
  });

  return categorySection + '\n';
}

/**
 * Builds the "Other Messages" section
 * @returns {string} Formatted text for other message types
 */
function buildOtherMessagesSection() {
  return (
    '*Other Messages:*\n' +
    '- Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.\n' +
    '- Send valid JSON data to update your drivers, constructors, and current team cache.\n' +
    `- Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using ${COMMAND_BEST_TEAMS.replace(
      /_/g,
      '\\_'
    )}).`
  );
}

module.exports = { displayHelpMessage };
