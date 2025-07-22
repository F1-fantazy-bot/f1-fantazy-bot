const { isAdminMessage, formatDateTime } = require('../utils');
const {
  driversCache,
  constructorsCache,
  simulationInfoCache,
  getPrintableCache,
  sharedKey,
} = require('../cache');
const {
  COMMAND_RESET_CACHE,
  COMMAND_LOAD_SIMULATION,
} = require('../constants');
const { t } = require('../i18n');

async function handleGetCurrentSimulation(bot, msg) {
  const chatId = msg.chat.id;
  const drivers = driversCache[chatId];
  const constructors = constructorsCache[chatId];

  // Check if user has data in their cache
  if (drivers || constructors) {
    await bot.sendMessage(
      chatId,
      t('You currently have data in your cache. To use data from a simulation, please run {CMD} first.', { CMD: COMMAND_RESET_CACHE })
    );

    return;
  }

  const simulationInfo = simulationInfoCache[sharedKey];
  if (!simulationInfo) {
    await bot.sendMessage(
      chatId,
      t('No simulation data is currently loaded. Please use {CMD} to load simulation data.', { CMD: COMMAND_LOAD_SIMULATION })
    );

    return;
  }

  const printableCache = getPrintableCache(sharedKey);

  await bot.sendMessage(chatId, printableCache, { parse_mode: 'Markdown' });
  let timeText = t('Unknown');
  if (simulationInfo.lastUpdate) {
    try {
      const date = new Date(simulationInfo.lastUpdate);
      const { dateStr, timeStr } = formatDateTime(date);
      timeText = `${dateStr} at ${timeStr}`;
    } catch (error) {
      timeText = t('Invalid date');
    }
  }
  const lastUpdateText = t('Last updated: {TIME}', { TIME: timeText });

  await bot.sendMessage(
    chatId,
    t('Current simulation: {NAME}\n{UPDATE}', {
      NAME: simulationInfo.name,
      UPDATE: lastUpdateText,
    })
  );

  if (isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('💡 Tip: If the simulation seems outdated, you can run {CMD} to update the current simulation.', {
        CMD: COMMAND_LOAD_SIMULATION,
      })
    );
  }

  return;
}

module.exports = { handleGetCurrentSimulation };
