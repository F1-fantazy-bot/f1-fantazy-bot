const { photosCache } = require('./cache');

exports.handlePhotoMessage = function (bot, msg) {
  const chatId = msg.chat.id;

  // The 'photo' property is an array of images in different sizes.
  // We select the largest version (usually the last element).
  const photoArray = msg.photo;
  const largestPhoto = photoArray[photoArray.length - 1];
  const fileId = largestPhoto.file_id;

  // Use the Telegram API to get file details.
  bot
    .getFile(fileId)
    .then(async (file) => {
      const fileSize = file.file_size;
      if (fileSize) {
        bot
          .sendMessage(chatId, `The size of the image is: ${fileSize} bytes`)
          .catch((err) =>
            console.error('Error sending photo size reply:', err)
          );
      } else {
        bot
          .sendMessage(chatId, 'Could not retrieve the image file size.')
          .catch((err) =>
            console.error('Error sending photo size error message:', err)
          );
      }

      const fileLink = await bot.getFileLink(fileId);
      const photoDetails = {
        fileId,
        file,
        fileLink,
      }

      if (photosCache[chatId]) {
        if (!photosCache[chatId].some(existing => existing.file.file_unique_id === photoDetails.file.file_unique_id)) {
          photosCache[chatId].push(photoDetails);
        }
      } else {
        photosCache[chatId] = [photoDetails];
      }

      bot
        .sendMessage(
          chatId,
          `The image has been saved to the cache. Total images in cache: ${photosCache[chatId].length}`
        )
        .catch((err) =>
          console.error('Error sending cache message:', err)
        );
    })
    .catch((err) => {
      console.error('Error retrieving file details:', err);
      bot
        .sendMessage(
          chatId,
          'An error occurred while retrieving the image details.'
        )
        .catch((err) => console.error('Error sending error message:', err));
    });
};
