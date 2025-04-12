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
    .then((file) => {
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
