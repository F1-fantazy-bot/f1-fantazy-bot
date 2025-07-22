const { isAdminMessage } = require('../utils');
const { t } = require('../i18n');

async function handleVersionCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, t('Sorry, only admins can use this command.'));

    return;
  }

  const { COMMIT_ID, COMMIT_MESSAGE, COMMIT_LINK } = process.env;
  const versionInfo = t(
    'Commit ID: {ID}\nCommit message: {MSG}\nLink: {LINK}',
    {
      ID: COMMIT_ID || 'N/A',
      MSG: COMMIT_MESSAGE || 'N/A',
      LINK: COMMIT_LINK || 'N/A',
    }
  );

  await bot.sendMessage(chatId, versionInfo);
}

module.exports = { handleVersionCommand };
