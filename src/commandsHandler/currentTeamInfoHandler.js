const { calculateTeamInfo } = require('../utils');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  sharedKey,
} = require('../cache');

async function calcCurrentTeamInfo(bot, chatId) {
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    await bot
      .sendMessage(
        chatId,
        'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );

    return;
  }

  const teamInfo = calculateTeamInfo(currentTeam, drivers, constructors);

  const message =
    `*Current Team Info:*\n` +
    `*Drivers & Constructors Total Price:* ${teamInfo.totalPrice.toFixed(
      2
    )}\n` +
    `*Cost Cap Remaining:* ${teamInfo.costCapRemaining.toFixed(2)}\n` +
    `*Total Budget:* ${teamInfo.overallBudget.toFixed(2)}\n` +
    `*Expected Points:* ${teamInfo.teamExpectedPoints.toFixed(2)}\n` +
    `*Expected Price Change:* ${teamInfo.teamPriceChange.toFixed(2)}`;

  await bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team info message:', err)
    );

  return;
}

module.exports = { calcCurrentTeamInfo };
