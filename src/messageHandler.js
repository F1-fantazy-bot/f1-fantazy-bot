const { getChatName, sendLogMessage } = require('./utils');
const { KILZI_CHAT_ID, DORSE_CHAT_ID } = require('./constants');
const { handleTextMessage } = require('./textMessageHandler');
const { handlePhotoMessage } = require('./photoMessageHandler');

exports.handleMessage = async function (bot, msg) {
  const chatId = msg.chat.id;
  const chatName = getChatName(msg);

  if (chatId !== KILZI_CHAT_ID && chatId !== DORSE_CHAT_ID) {
    sendLogMessage(bot, `Message from unknown chat: ${chatName} (${chatId})`);
    return;
  }

  sendLogMessage(bot, `Received a message from ${chatName} (${chatId})`);

  // Handle text messages
  if (msg.text) {
    await handleTextMessage(bot, msg);
    return;
  }

  // Handle image messages (photos)
  if (msg.photo) {
    handlePhotoMessage(bot, msg);
    return;
  }

  sendLogMessage(
    bot,
    `Received unsupported message type from ${chatName} (${chatId}).`
  );

  // For unsupported message types
  bot
    .sendMessage(chatId, 'Sorry, I only support text and image messages.')
    .catch((err) =>
      console.error('Error sending unsupported type reply:', err)
    );
};
