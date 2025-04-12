const { getChatName, sendLogMessage } = require('./utils');
const { KILZI_CHAT_ID, DORSE_CHAT_ID } = require('./constants');
const { CalculateBestTeams } = require('./bestTeamsCalculator');

exports.handleMessage = function (bot, msg) {
  const chatId = msg.chat.id;
  const chatName = getChatName(msg);

  if (chatId !== KILZI_CHAT_ID && chatId !== DORSE_CHAT_ID) {
    sendLogMessage(bot, `Message from unknown chat: ${chatName} (${chatId})`);
    return;
  }

  sendLogMessage(bot, `Received a message from ${chatName} (${chatId})`);

  // Handle text messages
  if (msg.text) {
    let jsonData;
    try {
      jsonData = JSON.parse(msg.text);
    } catch (error) {
      sendLogMessage(
        bot,
        `Failed to parse JSON data: ${msg.text}. Error: ${error.message}`
      );

      bot
        .sendMessage(chatId, 'Invalid JSON format. Please send valid JSON.')
        .catch((err) =>
          console.error('Error sending JSON error message:', err)
        );

      return;
    }
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
        .catch((err) =>
          console.error('Error sending JSON error message:', err)
        );

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
        .catch((err) =>
          console.error('Error sending JSON error message:', err)
        );

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
        .catch((err) =>
          console.error('Error sending JSON error message:', err)
        );

      return;
    }
    bot
      .sendMessage(chatId, 'Received valid JSON data')
      .catch((err) => console.error('Error sending JSON reply:', err));

    const bestTeams = CalculateBestTeams(jsonData);
    const bestTeamsString = JSON.stringify(bestTeams, null, 2); // Converts to a pretty-printed string
    bot
      .sendMessage(chatId, bestTeamsString)
      .catch((err) => console.error('Error sending JSON reply:', err));
      
    return;
  }

  // Handle image messages (photos)
  if (msg.photo) {
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
    return;
  }

  // For unsupported message types
  bot
    .sendMessage(chatId, 'Sorry, I only support text and image messages.')
    .catch((err) =>
      console.error('Error sending unsupported type reply:', err)
    );
};
