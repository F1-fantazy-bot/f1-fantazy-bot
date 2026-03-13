const { t } = require('../i18n');
const { BEST_TEAM_WEIGHTS_CALLBACK_TYPE } = require('../constants');
const { resolveSelectedTeam } = require('../cache');

const BEST_TEAM_RANKING_PRESETS = [
  {
    id: 'pure_points',
    budgetChangePointsPerMillion: 0,
    icon: '🎯',
    labelKey: 'Pure Points',
  },
  {
    id: 'points_lean',
    budgetChangePointsPerMillion: 1.3,
    icon: '⚖️',
    labelKey: 'Points Lean',
  },
  {
    id: 'points_plus_budget',
    budgetChangePointsPerMillion: 1.65,
    icon: '📊',
    labelKey: 'Points Plus Budget',
  },
  {
    id: 'balanced_budget_value',
    budgetChangePointsPerMillion: 2,
    icon: '🤝',
    labelKey: 'Balanced Budget Value',
  },
];

async function handleSetBestTeamRanking(bot, msg) {
  const chatId = msg.chat.id;
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

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
${t('Value = points added for each 1M budget change per race left.', chatId)}`,
    {
      reply_markup: { inline_keyboard },
    },
  );
}

module.exports = { handleSetBestTeamRanking, BEST_TEAM_RANKING_PRESETS };
