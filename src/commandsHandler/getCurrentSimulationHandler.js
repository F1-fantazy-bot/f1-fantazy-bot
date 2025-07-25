const { isAdminMessage, formatDateTime, sendMessageToUser } = require('../utils');
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
    await sendMessageToUser(
      bot,
      chatId,
      t('You currently have data in your cache. To use data from a simulation, please run {CMD} first.', chatId, { CMD: COMMAND_RESET_CACHE })
    );

    return;
  }

  const simulationInfo = simulationInfoCache[sharedKey];
  if (!simulationInfo) {
    await sendMessageToUser(
      bot,
      chatId,
      t('No simulation data is currently loaded. Please use {CMD} to load simulation data.', chatId, { CMD: COMMAND_LOAD_SIMULATION })
    );

    return;
  }

  const printableCache = getPrintableCache(sharedKey);

  await sendMessageToUser(bot, chatId, printableCache, { parse_mode: 'Markdown' });
  let timeText = t('Unknown', chatId);
  if (simulationInfo.lastUpdate) {
    try {
      const date = new Date(simulationInfo.lastUpdate);
      const { dateStr, timeStr } = formatDateTime(date, chatId);
      timeText = `${dateStr} at ${timeStr}`;
    } catch (error) {
      timeText = t('Invalid date', chatId);
    }
  }
  const lastUpdateText = t('Last updated: {TIME}', chatId, { TIME: timeText });

  await sendMessageToUser(
    bot,
    chatId,
    t('Current simulation: {NAME}\n{UPDATE}', chatId, {
      NAME: simulationInfo.name,
      UPDATE: lastUpdateText,
    })
  );

  if (isAdminMessage(msg)) {
    await sendMessageToUser(
      bot,
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
