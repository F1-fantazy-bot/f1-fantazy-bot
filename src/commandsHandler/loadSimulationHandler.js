const { isAdminMessage } = require('../utils');
const { loadSimulationData } = require('../cacheInitializer');

async function handleLoadSimulation(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, 'Sorry, only admins can use this command.');

    return;
  }

  try {
    await loadSimulationData(bot);
    await bot.sendMessage(
      chatId,
      'Simulation data fetched and cached successfully.'
    );
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `Failed to load simulation data: ${error.message}`
    );
  }
}

module.exports = { handleLoadSimulation };
