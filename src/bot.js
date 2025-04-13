// Load environment variables from .env file
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleMessage } = require('./messageHandler');
const { handleCallbackQuery } = require('./callbackQueryHandler');
const { TELEGRAM_BOT_TOKEN, NODE_ENV } = process.env;

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

// Listen for any kind of message.
bot.on('message', async (msg) => {
  await handleMessage(bot, msg);
});

bot.on('callback_query', async (query) => {
  await handleCallbackQuery(bot, query);
});

// Log polling errors
bot.on('polling_error', (err) => console.error('Polling error:', err));

module.exports = bot;
