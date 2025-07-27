const { isAdminMessage, sendMessageToUser } = require('../utils');
const { t } = require('../i18n');

async function handleVersionCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await sendMessageToUser(bot, chatId, t('Sorry, only admins can use this command.', chatId));

    return;
  }

  const { COMMIT_ID, COMMIT_MESSAGE, COMMIT_LINK } = process.env;
  const versionInfo = t(
    'Commit ID: {ID}\nCommit message: {MSG}\nLink: {LINK}',
    chatId,
    {
      ID: COMMIT_ID || 'N/A',
      MSG: COMMIT_MESSAGE || 'N/A',
      LINK: COMMIT_LINK || 'N/A',
    }
  );

  await sendMessageToUser(bot, chatId, versionInfo);
}

module.exports = { handleVersionCommand };
