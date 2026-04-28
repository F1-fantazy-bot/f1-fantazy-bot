const { t } = require('../i18n');
const { registerPendingReply } = require('../pendingReplyManager');

/**
 * Handle the /follow_league command.
 * Initiates a pending-reply flow that asks the user for the league code.
 * The actual follow (blob validation + persistence) happens in the
 * pendingReplyRegistry entry for 'follow_league'.
 */
async function handleFollowLeagueCommand(bot, msg) {
  const chatId = msg.chat.id;

  const prompt = [
    t('Please enter the league code you want to follow:', chatId),
    '',
    t(
      'To find your league code: go to the F1 Fantasy website, open the league you want to follow, click the share button, and copy the league code from there.',
      chatId,
    ),
    '',
    t('💡 Send /cancel at any time to abort.', chatId),
  ].join('\n');

  await registerPendingReply(chatId, 'follow_league');

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) =>
      console.error('Error sending register league prompt:', err),
    );
}

module.exports = { handleFollowLeagueCommand };
