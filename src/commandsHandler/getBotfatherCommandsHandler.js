const { isAdminMessage } = require('../utils');
const { USER_COMMANDS_CONFIG } = require('../constants');
const { t } = require('../i18n');
const { buildBotfatherSetup } = require('../cores/adminReadCore');

async function handleGetBotfatherCommands(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can get BotFather commands.', chatId)
    );

    return;
  }

  const botFatherCommands = buildBotfatherSetup(USER_COMMANDS_CONFIG, {
    limit: USER_COMMANDS_CONFIG.length,
  }).commands.map((command) =>
    `${command.command} - ${command.description}`,
  ).join('\n');

  await bot
    .sendMessage(chatId, botFatherCommands)
    .catch((err) =>
      console.error('Error sending BotFather commands message:', err)
    );
}

module.exports = { handleGetBotfatherCommands };
