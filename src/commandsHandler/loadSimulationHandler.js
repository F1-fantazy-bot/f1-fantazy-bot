const { loadSimulationData } = require('../cacheInitializer');
const { t } = require('../i18n');

async function handleLoadSimulation(bot, msg) {
  const chatId = msg.chat.id;

  try {
    await loadSimulationData(bot);
    await bot.sendMessage(
      chatId,
      t('Simulation data fetched and cached successfully.', chatId)
    );
  } catch (error) {
    await bot.sendMessage(
      chatId,
      t('Failed to load simulation data: {ERROR}', chatId, { ERROR: error.message })
    );
  }
}

module.exports = { handleLoadSimulation };
