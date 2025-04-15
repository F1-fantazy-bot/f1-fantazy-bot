const {
  LOG_CHANNEL_ID,
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT,
  EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT,
  EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT,
} = require('../constants');
exports.sendLogMessage = function (bot, logMessage) {
  if (!LOG_CHANNEL_ID) {
    console.error('LOG_CHANNEL_ID is not set');
    return;
  }

  const log = `${logMessage}
env: ${process.env.NODE_ENV === 'production' ? 'prod' : 'dev'}`;
  bot.sendMessage(LOG_CHANNEL_ID, log);
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

exports.mapPhotoTypeToSystemPrompt = {
  [DRIVERS_PHOTO_TYPE]: EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT,
  [CONSTRUCTORS_PHOTO_TYPE]: EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT,
  [CURRENT_TEAM_PHOTO_TYPE]: EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT,
};
