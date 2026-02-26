const {
  getChatName,
  sendLogMessage,
  isMessageFromAllowedUser,
} = require('./utils/utils');
const { handleTextMessage } = require('./textMessageHandler');
const { handlePhotoMessage } = require('./photoMessageHandler');
const { t } = require('./i18n');
const {
  hasPendingReply,
  getPendingReply,
  consumePendingReply,
} = require('./pendingReplyManager');

exports.handleMessage = async function (bot, msg) {
  const chatId = msg.chat.id;
  const chatName = getChatName(msg);

  if (!isMessageFromAllowedUser(msg)) {
    await sendLogMessage(
      bot,
      `Message from unknown chat: ${chatName} (${chatId})`,
    );

    return;
  }

  await sendLogMessage(bot, `Received a message from ${chatName} (${chatId})`);

  // Handle pending replies before text/photo branching
  // This supports reply-based commands that expect text or photo responses
  if (hasPendingReply(chatId)) {
    const pendingReply = getPendingReply(chatId);

    // If a validate function is defined and the message fails validation,
    // re-send the prompt and keep the pending reply active
    if (pendingReply.validate && !pendingReply.validate(msg)) {
      const resendMessage =
        pendingReply.resendPromptIfNotValid ||
        t('Invalid reply. Please try again.', chatId);

      await bot
        .sendMessage(chatId, resendMessage, {
          reply_markup: { force_reply: true },
        })
        .catch((err) =>
          console.error('Error re-sending validation prompt:', err),
        );

      return;
    }

    const replyHandler = consumePendingReply(chatId);

    return await replyHandler(bot, msg);
  }

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
    `Received unsupported message type from ${chatName} (${chatId}).`,
  );

  // For unsupported message types
  await bot
    .sendMessage(
      chatId,
      t('Sorry, I only support text and image messages.', chatId),
    )
    .catch((err) =>
      console.error('Error sending unsupported type reply:', err),
    );
};
