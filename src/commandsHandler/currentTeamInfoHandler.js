const { resolveSelectedTeam } = require('../cache');
const { getCurrentTeam } = require('../cores/currentTeamCore');
const { t } = require('../i18n');
const { refreshWeeklyTeamData } = require('../services/weeklyTeamDataService');
const { teamDataNotice, recommendationMessage } = require('../utils/teamDataPresentation');

async function calcCurrentTeamInfo(bot, chatId) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }
  await refreshWeeklyTeamData(chatId);

  const result = await getCurrentTeam({ chatId, teamId });
  const dataMessage = recommendationMessage(result.status, chatId);
  if (dataMessage) {
    await bot.sendMessage(chatId, dataMessage);

    return;
  }

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

  if (
    result.status === 'projection_mismatch' ||
    result.status === 'missing_weekend_format'
  ) {
    await bot.sendMessage(
      chatId,
      t(
        result.status === 'missing_weekend_format'
          ? 'Next race weekend format is unavailable. Please refresh the next race data and try again.'
          : 'Driver activity data is unavailable or inconsistent. Please refresh the API data and try again.',
        chatId,
      ),
    );

    return;
  }

  if (result.status !== 'ok') {
    // resolveSelectedTeam already handled the no_teams / ambiguous_team
    // user paths. Any other status here would mean a coding error.
    return;
  }

  const { teamInfo, budgetChangePointsPerMillion, budgetAdjustedPoints } = result;
  const formatBudget = (value) => Number.isFinite(value) ? value.toFixed(2) : t('Unknown', chatId);

  const message =
    `*${t('Current Team Info', chatId)}:*\n` +
    `*${t('Drivers & Constructors Total Price', chatId)}:* ${teamInfo.totalPrice.toFixed(2)}\n` +
    `*${t('Cost Cap Remaining', chatId)}:* ${formatBudget(teamInfo.costCapRemaining)}\n` +
    `*${t('Total Budget', chatId)}:* ${formatBudget(teamInfo.overallBudget)}\n` +
    `*${t('Expected Points', chatId)}:* ${teamInfo.teamExpectedPoints.toFixed(2)}\n` +
    (budgetChangePointsPerMillion > 0
      ? `*${t('Budget-Adjusted Points', chatId)}:* ${budgetAdjustedPoints.toFixed(2)}\n`
      : '') +
    `*${t('Expected Price Change', chatId)}:* ${teamInfo.teamPriceChange.toFixed(2)}`;

  await bot
    .sendMessage(chatId, [teamDataNotice(result.dataStatus, chatId), message].filter(Boolean).join('\n\n'), { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team info message:', err),
    );

  return;
}

module.exports = { calcCurrentTeamInfo };
