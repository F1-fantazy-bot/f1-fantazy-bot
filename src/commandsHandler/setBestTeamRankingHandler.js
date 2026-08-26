const { t } = require('../i18n');
const { BEST_TEAM_WEIGHTS_CALLBACK_TYPE } = require('../constants');
const { resolveSelectedTeam, remainingRaceCountCache, sharedKey } = require('../cache');
const {
  BEST_TEAM_RANKING_PRESETS,
} = require('../services/setBestTeamRankingService');

async function handleSetBestTeamRanking(bot, msg) {
  const chatId = msg.chat.id;
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const cachedRemainingRaceCount = remainingRaceCountCache[sharedKey];
  const effectiveRemainingRaceCount = Number.isFinite(cachedRemainingRaceCount)
    ? Math.max(0, cachedRemainingRaceCount - 1)
    : null;

  const inline_keyboard = BEST_TEAM_RANKING_PRESETS.map((preset) => [
    {
      text: t(
        '{ICON} {LABEL} ({VALUE})',
        chatId,
        {
          ICON: preset.icon,
          LABEL: t(preset.labelKey, chatId),
          VALUE: preset.budgetChangePointsPerMillion,
        },
      ),
      callback_data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:${teamId}:${preset.id}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    `${t('Choose best-team ranking preference:', chatId)}
${t('Value = points added for each 1M budget change per race left.', chatId)}
${
  effectiveRemainingRaceCount === null
    ? t('Remaining races used now: unavailable.', chatId)
    : t('Remaining races used now: {COUNT}.', chatId, {
      COUNT: effectiveRemainingRaceCount,
    })
}`,
    {
      reply_markup: { inline_keyboard },
    },
  );
}

module.exports = { handleSetBestTeamRanking, BEST_TEAM_RANKING_PRESETS };
