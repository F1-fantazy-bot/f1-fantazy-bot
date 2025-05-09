// Load environment variables from .env file
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleMessage } = require('./messageHandler');
const { handleCallbackQuery } = require('./callbackQueryHandler');
const { readJsonFromStorage } = require('./readJsonFromStorage');
const { TELEGRAM_BOT_TOKEN, NODE_ENV } = process.env;
const { sendLogMessage } = require('./utils');
if (!TELEGRAM_BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in the .env file.');
  process.exit(1);
}

// Create a bot instance.
let bot;
if (NODE_ENV !== 'production') {
  console.log('Running in development mode');
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
} else {
  console.log('Running in production mode');
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

// Send a message to the log channel that the bot has started.
sendLogMessage(bot, 'Bot started successfully.');

try {
  // Read JSON data from Azure Storage
  readJsonFromStorage(bot);
} catch (error) {
  sendLogMessage(bot, `Error reading JSON data from Azure Storage: ${error}`);
}

// Listen for any kind of message.
bot.on('message', async (msg) => {
  handleMessage(bot, msg);
});

bot.on('callback_query', async (query) => {
  await handleCallbackQuery(bot, query);
});

// Log polling errors
bot.on('polling_error', (err) =>
  sendLogMessage(bot, `Polling error: ${err.message}`)
);

bot.on('webhook_error', (err) =>
  sendLogMessage(bot, `Webhook error: ${err.message}`)
);

// Log any errors that occur
bot.on('error', (err) => {
  sendLogMessage(bot, `Error occurred: ${err.message}`);
});

process.on('uncaughtException', (err) => {
  sendLogMessage(bot, `Uncaught exception: ${err.message}`);
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  sendLogMessage(bot, `Unhandled rejection: ${reason}`);
  console.error('Unhandled rejection:', reason);
});

process.on('exit', (code) => {
  sendLogMessage(bot, `Process exited with code: ${code}`);
  console.log(`Process exited with code: ${code}`);
});

module.exports = bot;
