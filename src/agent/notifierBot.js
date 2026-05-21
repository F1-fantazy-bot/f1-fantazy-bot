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

// Prefix used by `sendLogMessage` / `sendErrorMessage` /
// `sendMessageToAdmins` in `src/utils/utils.js` to tag the log line.
// The agent runs in its own process and must be visually distinct from
// the original Telegram-bot path (which uses the default `BOT:` prefix).
const AGENT_LOG_PREFIX = 'AGENT';

let cachedBot = null;

function makeNoopBot() {
  return {
    sendMessage: async () => undefined,
    _logPrefix: AGENT_LOG_PREFIX,
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
    cachedBot._logPrefix = AGENT_LOG_PREFIX;
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

module.exports = { getNotifierBot, resetNotifierBotForTests, AGENT_LOG_PREFIX };
