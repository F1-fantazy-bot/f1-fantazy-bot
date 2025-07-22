const { photoCache } = require('./cache');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  PHOTO_CALLBACK_TYPE,
} = require('./constants');
const { t } = require('./i18n');

exports.handlePhotoMessage = async function (bot, msg) {
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
  await bot.sendMessage(chatId, t('What type is this photo?'), {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t('Drivers'),
            callback_data: `${PHOTO_CALLBACK_TYPE}:${DRIVERS_PHOTO_TYPE}:${fileUniqueId}`,
          },
          {
            text: t('Constructors'),
            callback_data: `${PHOTO_CALLBACK_TYPE}:${CONSTRUCTORS_PHOTO_TYPE}:${fileUniqueId}`,
          },
          {
            text: t('Current Team'),
            callback_data: `${PHOTO_CALLBACK_TYPE}:${CURRENT_TEAM_PHOTO_TYPE}:${fileUniqueId}`,
          },
        ],
      ],
    },
  });
};
