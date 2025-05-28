const { triggerScraping, isAdminMessage } = require('../utils');

async function handleScrapingTrigger(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, 'Sorry, only admins can trigger scraping.');

    return;
  }

  const result = await triggerScraping(bot);
  if (result.success) {
    await bot.sendMessage(chatId, 'Web scraping triggered successfully.');
  } else {
    await bot.sendMessage(
      chatId,
      `Failed to trigger web scraping: ${result.error}`
    );
  }
}

module.exports = { handleScrapingTrigger };
