exports.sendLogMessage = function (bot, logMessage) {
  const logChannelId = process.env.LOG_CHANNEL_ID;

  if (!logChannelId) {
    console.error('LOG_CHANNEL_ID is not set.');
    return;
  }

  bot.sendMessage(logChannelId, logMessage);
};

exports.getChatName = function (msg) {
  if (!msg || !msg.chat) {
    return 'Unknown Chat';
  }
  if (msg.chat.title) {
    return msg.chat.title;
  }
  if (msg.chat.username) {
    return msg.chat.username;
  }
  if (msg.chat.first_name || msg.chat.last_name) {
    return `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`;
  }
  return 'Unknown Chat';
};
