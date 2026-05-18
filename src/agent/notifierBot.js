// Notifier bot for the web-chat agent process.
//
// The agent runs in a separate process from the Telegram bot, so it has no
// active `TelegramBot` instance available. We still want it to push token
// usage / error logs into the same Telegram log + error channels the bot
// uses. To do that, we instantiate a *non-polling* `TelegramBot` here. A
// polling-disabled bot can still call `sendMessage` (Telegram's Bot API
// allows multiple senders for the same token) without conflicting with the
// main bot process which owns the long-polling loop.
//
// If `TELEGRAM_BOT_TOKEN` is unset (e.g. local dev without Telegram), we
// fall back to a noop "bot" so `initializeCaches(bot)` and the token-usage
// middleware still work — they just log to stdout via the
// `sendLogMessage` / `sendErrorMessage` helpers which always
// `console.log` first.

const TelegramBot = require('node-telegram-bot-api');

let cachedBot = null;

function makeNoopBot() {
  return {
    sendMessage: async () => undefined,
  };
}

function getNotifierBot() {
  if (cachedBot) {
    return cachedBot;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(
      'AGENT: TELEGRAM_BOT_TOKEN not set — notifier bot is in noop mode (stdout only).',
    );
    cachedBot = makeNoopBot();

    return cachedBot;
  }

  try {
    cachedBot = new TelegramBot(token, { polling: false });
  } catch (err) {
    console.error(
      'AGENT: Failed to construct notifier TelegramBot, falling back to noop:',
      err,
    );
    cachedBot = makeNoopBot();
  }

  return cachedBot;
}

function resetNotifierBotForTests() {
  cachedBot = null;
}

module.exports = { getNotifierBot, resetNotifierBotForTests };
