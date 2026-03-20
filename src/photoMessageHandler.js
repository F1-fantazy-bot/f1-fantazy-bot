const { CURRENT_TEAM_PHOTO_TYPE } = require('./constants');
const { processPhotoByType } = require('./photoProcessingService');

exports.handlePhotoMessage = async function (bot, msg) {
  const chatId = msg.chat.id;
  const photoArray = msg.photo;
  const largestPhoto = photoArray[photoArray.length - 1];
  const fileId = largestPhoto.file_id;
  const fileUniqueId = largestPhoto.file_unique_id;

  await processPhotoByType(
    bot,
    chatId,
    CURRENT_TEAM_PHOTO_TYPE,
    fileId,
    fileUniqueId,
  );
};
