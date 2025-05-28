const { getPrintableCache, selectedChipCache } = require('../cache');

async function sendPrintableCache(chatId, bot) {
  const printableCache = getPrintableCache(chatId);
  const selectedChip = selectedChipCache[chatId];

  if (printableCache) {
    await bot
      .sendMessage(chatId, printableCache, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending drivers cache:', err));
  } else {
    await bot
      .sendMessage(
        chatId,
        'Drivers cache is empty. Please send drivers image or valid JSON data.'
      )
      .catch((err) =>
        console.error('Error sending empty drivers cache message:', err)
      );
  }

  if (selectedChip) {
    await bot
      .sendMessage(chatId, `Selected Chip: ${selectedChip}`)
      .catch((err) =>
        console.error('Error sending selected chip message:', err)
      );
  } else {
    await bot
      .sendMessage(chatId, 'No chip selected.')
      .catch((err) => console.error('Error sending no chip message:', err));
  }

  return;
}

module.exports = { sendPrintableCache };
