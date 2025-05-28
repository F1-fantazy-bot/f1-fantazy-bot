const { isAdminMessage } = require('../utils');

async function handleLoadSimulation(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, 'Sorry, only admins can use this command.');

    return;
  }

  try {
    // TODO: readJsonFromStorage function is not defined in the codebase
    // This needs to be implemented or imported from the correct module
    await readJsonFromStorage(bot);
    await bot.sendMessage(chatId, 'JSON data fetched and cached successfully.');
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `Failed to fetch JSON data: ${error.message}`
    );
  }
}

module.exports = { handleLoadSimulation };
