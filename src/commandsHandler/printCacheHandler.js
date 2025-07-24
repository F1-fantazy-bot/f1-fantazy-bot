const { getPrintableCache, selectedChipCache } = require('../cache');
const { t } = require('../i18n');

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
        t('Drivers cache is empty. Please send drivers image or valid JSON data.', chatId)
      )
      .catch((err) =>
        console.error('Error sending empty drivers cache message:', err)
      );
  }

  if (selectedChip) {
    await bot
      .sendMessage(chatId, t('Selected Chip: {CHIP}', chatId, { CHIP: selectedChip }))
      .catch((err) =>
        console.error('Error sending selected chip message:', err)
      );
  } else {
    await bot
      .sendMessage(chatId, t('No chip selected.', chatId))
      .catch((err) => console.error('Error sending no chip message:', err));
  }

  return;
}

module.exports = { sendPrintableCache };
