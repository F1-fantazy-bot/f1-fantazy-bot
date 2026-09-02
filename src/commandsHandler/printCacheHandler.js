const {
  getPrintableCache,
  driversCache,
  constructorsCache,
  currentTeamCache,
  simulationInfoCache,
  pricesCache,
  sharedKey,
  userCache,
} = require('../cache');
const { buildDataStatus } = require('../cores/dataStatusCore');
const { t } = require('../i18n');

async function sendPrintableCache(chatId, bot) {
  const printableCache = getPrintableCache(chatId);
  const dataStatus = buildDataStatus({
    simulationInfo: simulationInfoCache?.[sharedKey],
    sharedDrivers: driversCache?.[sharedKey],
    sharedConstructors: constructorsCache?.[sharedKey],
    drivers: driversCache?.[chatId],
    constructors: constructorsCache?.[chatId],
    pricesMetadata: pricesCache?.metadata,
    teams: currentTeamCache?.[chatId],
    selectedTeamId: userCache?.[String(chatId)]?.selectedTeam,
    projectionSource:
      driversCache?.[chatId] || constructorsCache?.[chatId]
        ? 'personal_or_mixed'
        : 'simulation',
    printableCache,
  });

  if (dataStatus.printableCacheAvailable) {
    await bot
      .sendMessage(chatId, printableCache, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending cache:', err));
  } else {
    await bot
      .sendMessage(
        chatId,
        t(
          'Drivers cache is empty. Please send drivers image or valid JSON data.',
          chatId,
        ),
      )
      .catch((err) => console.error('Error sending empty cache message:', err));
  }
}

module.exports = { sendPrintableCache };
