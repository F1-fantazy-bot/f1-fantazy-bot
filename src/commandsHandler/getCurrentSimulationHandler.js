const { isAdminMessage, formatDateTime } = require('../utils');
const {
  driversCache,
  constructorsCache,
  simulationInfoCache,
  getPrintableCache,
  sharedKey,
  pricesCache,
} = require('../cache');
const { buildSimulationStatus } = require('../cores/simulationStatusCore');
const {
  COMMAND_RESET_CACHE,
  COMMAND_LOAD_SIMULATION,
} = require('../constants');
const { t } = require('../i18n');

async function handleGetCurrentSimulation(bot, msg) {
  const chatId = msg.chat.id;
  const drivers = driversCache[chatId];
  const constructors = constructorsCache[chatId];
  const simulationStatus = buildSimulationStatus({
    simulationInfo: simulationInfoCache[sharedKey],
    drivers: driversCache[sharedKey],
    constructors: constructorsCache[sharedKey],
    pricesMetadata: pricesCache?.metadata,
  });

  // Check if user has data in their cache
  if (drivers || constructors) {
    await bot.sendMessage(
      chatId,
      t('You currently have data in your cache. To use data from a simulation, please run {CMD} first.', chatId, { CMD: COMMAND_RESET_CACHE })
    );

    return;
  }

  if (simulationStatus.status === 'not_loaded') {
    await bot.sendMessage(
      chatId,
      t('No simulation data is currently loaded. Please use {CMD} to load simulation data.', chatId, { CMD: COMMAND_LOAD_SIMULATION })
    );

    return;
  }

  const printableCache = getPrintableCache(sharedKey);

  await bot.sendMessage(chatId, printableCache, { parse_mode: 'Markdown' });
  let timeText = t('Unknown', chatId);
  if (simulationStatus.lastUpdate) {
    try {
      const date = new Date(simulationStatus.lastUpdate);
      const { dateStr, timeStr } = formatDateTime(date, chatId);
      timeText = `${dateStr} at ${timeStr}`;
    } catch (error) {
      timeText = t('Invalid date', chatId);
    }
  }
  const lastUpdateText = t('Last updated: {TIME}', chatId, { TIME: timeText });

  await bot.sendMessage(
    chatId,
    t('Current simulation: {NAME}\n{UPDATE}', chatId, {
      NAME: simulationStatus.source?.name || simulationInfoCache[sharedKey].name,
      UPDATE: lastUpdateText,
    }),
  );

  if (isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t(
        '💡 Tip: If the simulation seems outdated, you can run {CMD} to update the current simulation.',
        chatId,
        { CMD: COMMAND_LOAD_SIMULATION }
      )
    );
  }

  return;
}

module.exports = { handleGetCurrentSimulation };
