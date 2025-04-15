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

exports.validateJsonData = function (bot, jsonData, chatId) {
  if (!jsonData.Drivers || jsonData.Drivers.length !== 20) {
      sendLogMessage(
          bot,
          `Invalid JSON data: ${msg.text}. Expected 20 drivers under "Drivers" property'.`
      );
      bot
        .sendMessage(
          chatId,
          'Invalid JSON data. Please ensure it contains 20 drivers under "Drivers" property.'
        )
        .catch((err) => console.error('Error sending JSON error message:', err));
      return;
  }

  if (!jsonData.Constructors || jsonData.Constructors.length !== 10) {
      sendLogMessage(
          bot,
          `Invalid JSON data: ${msg.text}. Expected 10 constructors under "Constructors" property'.`
      );
      bot
        .sendMessage(
          chatId,
          'Invalid JSON data. Please ensure it contains 10 constructors under "Constructors" property.'
        )
        .catch((err) => console.error('Error sending JSON error message:', err));
      return;
  }

  if (
      !jsonData.CurrentTeam ||
      !jsonData.CurrentTeam.drivers ||
      jsonData.CurrentTeam.drivers.length !== 5 ||
      !jsonData.CurrentTeam.constructors ||
      jsonData.CurrentTeam.constructors.length !== 2 ||
      !jsonData.CurrentTeam.drsBoost ||
      !jsonData.CurrentTeam.freeTransfers ||
      !jsonData.CurrentTeam.costCapRemaining
  ) {
      sendLogMessage(
          bot,
          `Invalid JSON data: ${msg.text}. Expected 5 drivers, 2 constructors, drsBoost, freeTransfers, and costCapRemaining properties under "CurrentTeam" property'.`
      );
      bot
        .sendMessage(
          chatId,
          'Invalid JSON data. Please ensure it contains the required properties under "CurrentTeam" property.'
        )
        .catch((err) => console.error('Error sending JSON error message:', err));
      return;
  }
};