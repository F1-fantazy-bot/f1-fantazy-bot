const { getPrintableCache } = require('../cache');
const { t } = require('../i18n');

async function sendPrintableCache(chatId, bot) {
  const printableCache = getPrintableCache(chatId);

  if (printableCache) {
    await bot
      .sendMessage(chatId, printableCache, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending cache:', err));
  } else {
    await bot
      .sendMessage(
        chatId,
        t(
          'Drivers cache is empty. Please send drivers image or valid JSON data.',
          chatId,
        ),
      )
      .catch((err) => console.error('Error sending empty cache message:', err));
  }
}

module.exports = { sendPrintableCache };
