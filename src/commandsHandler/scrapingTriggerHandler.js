const { triggerScraping, isAdminMessage } = require('../utils');
const { t } = require('../i18n');

async function handleScrapingTrigger(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, t('Sorry, only admins can trigger scraping.', chatId));

    return;
  }

  const result = await triggerScraping(bot);
  if (result.success) {
    await bot.sendMessage(chatId, t('Web scraping triggered successfully.', chatId));
  } else {
    await bot.sendMessage(
      chatId,
      t('Failed to trigger web scraping: {ERROR}', chatId, { ERROR: result.error })
    );
  }
}

module.exports = { handleScrapingTrigger };
