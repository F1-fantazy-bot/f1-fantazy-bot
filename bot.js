// Load environment variables from .env file
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');

// Retrieve the bot token from environment variables.
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in the .env file.');
  process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates.
const bot = new TelegramBot(token, { polling: true });

// Listen for any kind of message.
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  // Handle text messages
  if (msg.text) {
    const textLength = msg.text.length;
    bot
      .sendMessage(chatId, `The length of your text is: ${textLength}`)
      .catch((err) => console.error('Error sending text reply:', err));
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
});

// Log polling errors
bot.on('polling_error', (err) => console.error('Polling error:', err));
