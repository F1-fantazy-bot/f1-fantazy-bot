const { isAdminMessage } = require('../utils');
const {
  driversCache,
  constructorsCache,
  simulationNameCache,
  getPrintableCache,
  sharedKey,
} = require('../cache');
const {
  COMMAND_RESET_CACHE,
  COMMAND_LOAD_SIMULATION,
} = require('../constants');

async function handleGetCurrentSimulation(bot, msg) {
  const chatId = msg.chat.id;
  const drivers = driversCache[chatId];
  const constructors = constructorsCache[chatId];

  // Check if user has data in their cache
  if (drivers || constructors) {
    await bot.sendMessage(
      chatId,
      `You currently have data in your cache. To use data from a simulation, please run ${COMMAND_RESET_CACHE} first.`
    );

    return;
  }

  const simulationName = simulationNameCache[sharedKey];
  if (!simulationName) {
    await bot.sendMessage(
      chatId,
      `No simulation data is currently loaded. Please use ${COMMAND_LOAD_SIMULATION} to load simulation data.`
    );

    return;
  }

  const printableCache = getPrintableCache(sharedKey);

  await bot.sendMessage(chatId, printableCache, { parse_mode: 'Markdown' });
  await bot.sendMessage(chatId, `Current simulation name: ${simulationName}`);

  if (isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      `💡 Tip: If the simulation seems outdated, you can run ${COMMAND_LOAD_SIMULATION} to update the current simulation.`
    );
  }

  return;
}

module.exports = { handleGetCurrentSimulation };
