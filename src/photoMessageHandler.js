const { photoCache } = require('./cache');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

exports.handlePhotoMessage = function (bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // The 'photo' property is an array of images in different sizes.
  // We select the largest version (usually the last element).
  const photoArray = msg.photo;
  const largestPhoto = photoArray[photoArray.length - 1];
  const fileId = largestPhoto.file_id;
  const fileUniqueId = largestPhoto.file_unique_id;

  photoCache[fileUniqueId] = {
    fileId,
    chatId,
    messageId,
  };

  // Reply with inline buttons
  bot.sendMessage(chatId, 'What type is this photo?', {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Drivers',
            callback_data: `${DRIVERS_PHOTO_TYPE}:${fileUniqueId}`,
          },
          {
            text: 'Constructors',
            callback_data: `${CONSTRUCTORS_PHOTO_TYPE}:${fileUniqueId}`,
          },
          {
            text: 'Current Team',
            callback_data: `${CURRENT_TEAM_PHOTO_TYPE}:${fileUniqueId}`,
          },
        ],
      ],
    },
  });
};
