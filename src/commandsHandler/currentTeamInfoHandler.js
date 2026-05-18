const { resolveSelectedTeam } = require('../cache');
const { getCurrentTeam } = require('../cores/currentTeamCore');
const { t } = require('../i18n');

async function calcCurrentTeamInfo(bot, chatId) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const result = await getCurrentTeam({ chatId, teamId });

  if (result.status === 'missing_cache') {
    await bot
      .sendMessage(
        chatId,
        t(
          'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
          chatId,
        ),
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err),
      );

    return;
  }

  if (result.status !== 'ok') {
    // resolveSelectedTeam already handled the no_teams / ambiguous_team
    // user paths. Any other status here would mean a coding error.
    return;
  }

  const { teamInfo, budgetChangePointsPerMillion, budgetAdjustedPoints } = result;

  const message =
    `*${t('Current Team Info', chatId)}:*\n` +
    `*${t('Drivers & Constructors Total Price', chatId)}:* ${teamInfo.totalPrice.toFixed(2)}\n` +
    `*${t('Cost Cap Remaining', chatId)}:* ${teamInfo.costCapRemaining.toFixed(2)}\n` +
    `*${t('Total Budget', chatId)}:* ${teamInfo.overallBudget.toFixed(2)}\n` +
    `*${t('Expected Points', chatId)}:* ${teamInfo.teamExpectedPoints.toFixed(2)}\n` +
    (budgetChangePointsPerMillion > 0
      ? `*${t('Budget-Adjusted Points', chatId)}:* ${budgetAdjustedPoints.toFixed(2)}\n`
      : '') +
    `*${t('Expected Price Change', chatId)}:* ${teamInfo.teamPriceChange.toFixed(2)}`;

  await bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team info message:', err),
    );

  return;
}

module.exports = { calcCurrentTeamInfo };
