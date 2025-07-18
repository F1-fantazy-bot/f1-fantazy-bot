const { sendMessageToAdmins, getChatName } = require('../utils');

// Track pending contact requests by chatId -> messageId
const awaitingContactMessages = {};

async function handleContactUsCommand(bot, msg) {
  const chatId = msg.chat.id;
  const sent = await bot.sendMessage(chatId, 'Please write your message for the admins:', {
    reply_markup: { force_reply: true },
  });

  awaitingContactMessages[chatId] = sent.message_id;
}

async function processContactUsResponse(bot, msg) {
  const chatId = msg.chat.id;
  const expectedId = awaitingContactMessages[chatId];

  if (
    expectedId &&
    msg.reply_to_message &&
    msg.reply_to_message.message_id === expectedId
  ) {
    const chatName = getChatName(msg);
    await sendMessageToAdmins(
      bot,
      `Contact from ${chatName} (${chatId}):\n${msg.text}`
    );
    await bot.sendMessage(chatId, 'Your message was sent to the admins. Thank you!');
    delete awaitingContactMessages[chatId];

    return true;
  }

  return false;
}

module.exports = {
  handleContactUsCommand,
  processContactUsResponse,
  awaitingContactMessages,
};
