const { isAdminMessage, sendMessageToUser } = require('../utils');
const { loadSimulationData } = require('../cacheInitializer');
const { t } = require('../i18n');

async function handleLoadSimulation(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await sendMessageToUser(bot, chatId, t('Sorry, only admins can use this command.', chatId));

    return;
  }

  try {
    await loadSimulationData(bot);
    await sendMessageToUser(
      bot,
      chatId,
      t('Simulation data fetched and cached successfully.', chatId)
    );
  } catch (error) {
    await sendMessageToUser(
      bot,
      chatId,
      t('Failed to load simulation data: {ERROR}', chatId, { ERROR: error.message })
    );
  }
}

module.exports = { handleLoadSimulation };
