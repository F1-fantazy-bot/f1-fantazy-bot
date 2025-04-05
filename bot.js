// Load environment variables from .env file
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleMessage } = require('./messageHandler');
const { TELEGRAM_BOT_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in the .env file.');
  process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates.
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Listen for any kind of message.
bot.on('message', (msg) => {
  handleMessage(bot, msg);
});

// Log polling errors
bot.on('polling_error', (err) => console.error('Polling error:', err));
