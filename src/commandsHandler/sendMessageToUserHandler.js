const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

/**
 * Handle the /send_message_to_user admin command.
 * Initiates a two-step reply flow:
 *   Step 1: Asks admin for the target user's chat ID
 *   Step 2: Asks admin for the message or image to send (handled in pendingReplyRegistry)
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleSendMessageToUserCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  const prompt = t(
    'Please enter the chat ID of the user you want to send a message or image to:',
    chatId,
  );

  await registerPendingReply(chatId, 'send_message_to_user', {
    step: 'collect_user_id',
  });

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) =>
      console.error('Error sending send message to user prompt:', err),
    );
}

module.exports = { handleSendMessageToUserCommand };
