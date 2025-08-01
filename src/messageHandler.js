const {
  getChatName,
  sendLogMessage,
  isAdminMessage,
} = require('./utils/utils');
const { handleTextMessage } = require('./textMessageHandler');
const { handlePhotoMessage } = require('./photoMessageHandler');
const { t } = require('./i18n');

exports.handleMessage = async function (bot, msg) {
  const chatId = msg.chat.id;
  const chatName = getChatName(msg);


  if (!isAdminMessage(msg)) {
    await sendLogMessage(
      bot,
      `Message from unknown chat: ${chatName} (${chatId})`
    );

    return;
  }

  await sendLogMessage(bot, `Received a message from ${chatName} (${chatId})`);

  // Handle text messages
  if (msg.text) {
    await handleTextMessage(bot, msg);

    return;
  }

  // Handle image messages (photos)
  if (msg.photo) {
    await handlePhotoMessage(bot, msg);

    return;
  }

  await sendLogMessage(
    bot,
    `Received unsupported message type from ${chatName} (${chatId}).`
  );

  // For unsupported message types
  await bot
    .sendMessage(chatId, t('Sorry, I only support text and image messages.', chatId))
    .catch((err) =>
      console.error('Error sending unsupported type reply:', err)
    );
};
