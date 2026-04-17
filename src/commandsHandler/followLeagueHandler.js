const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

/**
 * Handle the /follow_league admin command.
 * Initiates a pending-reply flow that asks the admin for the league code.
 * The actual follow (blob validation + persistence) happens in the
 * pendingReplyRegistry entry for 'follow_league'.
 */
async function handleFollowLeagueCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

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
