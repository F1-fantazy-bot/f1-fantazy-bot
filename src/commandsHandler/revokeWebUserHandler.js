const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

/**
 * Handle the /revoke_web_user admin command. Single-step pending-reply:
 * admin types the email, the handler deletes the allowlist row.
 *
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleRevokeWebUserCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  const prompt = `${t(
    'Please enter the Google email to revoke from the web agent:',
    chatId,
  )}\n\n${t('💡 Send /cancel at any time to abort.', chatId)}`;

  await registerPendingReply(chatId, 'revoke_web_user');

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) =>
      console.error('Error sending revoke web user prompt:', err),
    );
}

module.exports = { handleRevokeWebUserCommand };
