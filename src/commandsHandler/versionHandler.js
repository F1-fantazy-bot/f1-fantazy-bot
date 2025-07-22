const { isAdminMessage } = require('../utils');
const { t } = require('../i18n');

async function handleVersionCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, t('Sorry, only admins can use this command.'));

    return;
  }

  const { COMMIT_ID, COMMIT_MESSAGE, COMMIT_LINK } = process.env;
  const versionInfo = `Commit ID: ${COMMIT_ID || 'N/A'}\nCommit message: ${
    COMMIT_MESSAGE || 'N/A'
  }\nLink: ${COMMIT_LINK || 'N/A'}`;

  await bot.sendMessage(chatId, versionInfo);
}

module.exports = { handleVersionCommand };
