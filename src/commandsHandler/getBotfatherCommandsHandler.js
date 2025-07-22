const { isAdminMessage } = require('../utils');
const { USER_COMMANDS_CONFIG } = require('../constants');
const { t } = require('../i18n');

async function handleGetBotfatherCommands(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can get BotFather commands.')
    );

    return;
  }

  const botFatherCommands = USER_COMMANDS_CONFIG.map(
    (cmd) => `${cmd.constant.substring(1)} - ${t(cmd.description)}`
  ).join('\n');

  await bot
    .sendMessage(chatId, botFatherCommands)
    .catch((err) =>
      console.error('Error sending BotFather commands message:', err)
    );
}

module.exports = { handleGetBotfatherCommands };
