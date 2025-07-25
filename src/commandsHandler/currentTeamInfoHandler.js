const { calculateTeamInfo } = require('../utils');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  sharedKey,
} = require('../cache');
const { t } = require('../i18n');
const { sendMessageToUser } = require('../utils');

async function calcCurrentTeamInfo(bot, chatId) {
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    await sendMessageToUser(
      bot,
      chatId,
      t(
        'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
        chatId
      )
    )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );

    return;
  }

  const teamInfo = calculateTeamInfo(currentTeam, drivers, constructors);

  const message =
    `*${t('Current Team Info', chatId)}:*\n` +
    `*${t('Drivers & Constructors Total Price', chatId)}:* ${teamInfo.totalPrice.toFixed(2)}\n` +
    `*${t('Cost Cap Remaining', chatId)}:* ${teamInfo.costCapRemaining.toFixed(2)}\n` +
    `*${t('Total Budget', chatId)}:* ${teamInfo.overallBudget.toFixed(2)}\n` +
    `*${t('Expected Points', chatId)}:* ${teamInfo.teamExpectedPoints.toFixed(2)}\n` +
    `*${t('Expected Price Change', chatId)}:* ${teamInfo.teamPriceChange.toFixed(2)}`;

  await sendMessageToUser(bot, chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team info message:', err)
    );

  return;
}

module.exports = { calcCurrentTeamInfo };
