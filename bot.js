// Load environment variables from .env file
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleMessage } = require('./messageHandler');
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
  // todo: kilzi: change to webhooks
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
}

// Listen for any kind of message.
bot.on('message', (msg) => {
  handleMessage(bot, msg);
});

// Log polling errors
bot.on('polling_error', (err) => console.error('Polling error:', err));
