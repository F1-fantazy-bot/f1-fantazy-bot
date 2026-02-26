const { t } = require('../i18n');
const { getChatName, sendMessageToAdmins } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

async function handleReportBugCommand(bot, msg) {
  const chatId = msg.chat.id;

  const prompt = t(
    'What message would you like to send to the admins?',
    chatId,
  );

  registerPendingReply(
    chatId,
    (replyBot, replyMsg) => onReply(replyBot, replyMsg, chatId),
    {
      validate: (replyMsg) => !!replyMsg.text,
      resendPromptIfNotValid: t('We support only text. {PROMPT}', chatId, {
        PROMPT: prompt,
      }),
    },
  );

  await bot
    .sendMessage(chatId, prompt, {
      reply_markup: { force_reply: true },
    })
    .catch((err) => console.error('Error sending report bug prompt:', err));
}

async function onReply(replyBot, replyMsg, chatId) {
  const chatName = getChatName(replyMsg);

  const adminMessage = t(
    'Bug report from {NAME} ({ID}):\n\n{MESSAGE}',
    chatId,
    {
      NAME: chatName,
      ID: chatId,
      MESSAGE: replyMsg.text,
    },
  );

  await sendMessageToAdmins(replyBot, adminMessage);

  const confirmation = t(
    'Your message has been sent to the admins. Thank you!',
    chatId,
  );

  await replyBot
    .sendMessage(chatId, confirmation)
    .catch((err) =>
      console.error('Error sending bug report confirmation:', err),
    );
}

module.exports = { handleReportBugCommand };
