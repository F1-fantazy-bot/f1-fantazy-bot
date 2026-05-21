const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

/**
 * Handle the /allow_web_user admin command.
 * Two-step pending-reply flow:
 *   Step 1: collect the Google email address.
 *   Step 2: collect the chat ID and write `{ email → chatId }` to the
 *           web user allowlist.
 *
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleAllowWebUserCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  const prompt = `${t(
    'Please enter the Google email to allow on the web agent:',
    chatId,
  )}\n\n${t('💡 Send /cancel at any time to abort.', chatId)}`;

  await registerPendingReply(chatId, 'allow_web_user', {
    step: 'collect_email',
  });

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) =>
      console.error('Error sending allow web user prompt:', err),
    );
}

module.exports = { handleAllowWebUserCommand };
