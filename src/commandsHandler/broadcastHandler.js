const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

/**
 * Handle the /broadcast admin command.
 * Initiates a single-step reply flow:
 *   Asks admin for the message or image to broadcast to all registered users.
 *   The actual broadcast logic lives in pendingReplyRegistry under 'broadcast'.
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleBroadcastCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  const prompt = t(
    'Please enter the message or image you want to broadcast to all users:',
    chatId,
  );

  await registerPendingReply(chatId, 'broadcast');

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) =>
      console.error('Error sending broadcast prompt:', err),
    );
}

module.exports = { handleBroadcastCommand };
