const { isAdminMessage } = require('../utils');
const { loadSimulationData } = require('../cacheInitializer');
const { t } = require('../i18n');

async function handleLoadSimulation(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, t('Sorry, only admins can use this command.', chatId));

    return;
  }

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
