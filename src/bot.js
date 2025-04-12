// Load environment variables from .env file
const NODE_ENV = process.env.NODE_ENV;
const envFile = NODE_ENV === 'production' ? '.env' : '.env.local';
require('dotenv').config({ path: envFile });
const TelegramBot = require('node-telegram-bot-api');
const { handleMessage } = require('./messageHandler');
const { TELEGRAM_BOT_TOKEN } = process.env;

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
bot.on('message', (msg) => {
  handleMessage(bot, msg);
});

// Log polling errors
bot.on('polling_error', (err) => console.error('Polling error:', err));

module.exports = bot;
