const { t } = require('../i18n');
const { registerPendingReply } = require('../pendingReplyManager');

async function handleReportBugCommand(bot, msg) {
  const chatId = msg.chat.id;

  const prompt = t(
    'What message would you like to send to the admins?',
    chatId,
  );

  await registerPendingReply(chatId, 'report_bug');

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) => console.error('Error sending report bug prompt:', err));
}

module.exports = { handleReportBugCommand };
