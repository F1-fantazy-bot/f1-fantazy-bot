const { isAdminMessage } = require('../utils');
const {
  USER_COMMANDS_CONFIG,
  ADMIN_COMMANDS_CONFIG,
  COMMAND_BEST_TEAMS,
} = require('../constants');

async function displayHelpMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);

  let helpMessage = '*Available Commands:*\n';
  USER_COMMANDS_CONFIG.forEach((cmd) => {
    helpMessage += `${cmd.constant.replace(/_/g, '\\_')} - ${
      cmd.description
    }\n`;
  });
  helpMessage += '\n';

  if (isAdmin) {
    helpMessage += '*Admin Commands:*\n';
    ADMIN_COMMANDS_CONFIG.forEach((cmd) => {
      helpMessage += `${cmd.constant.replace(/_/g, '\\_')} - ${
        cmd.description
      }\n`;
    });
    helpMessage += '\n';
  }

  helpMessage +=
    '*Other Messages:*\n' +
    '- Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.\n' +
    '- Send valid JSON data to update your drivers, constructors, and current team cache.\n' +
    `- Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using ${COMMAND_BEST_TEAMS.replace(
      /_/g,
      '\\_'
    )}).`;

  await bot
    .sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending help message:', err));

  return;
}

module.exports = { displayHelpMessage };
