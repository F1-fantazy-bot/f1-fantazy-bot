const { t } = require('../i18n');
const { BEST_TEAM_WEIGHTS_CALLBACK_TYPE } = require('../constants');
const { resolveSelectedTeam } = require('../cache');

const BEST_TEAM_WEIGHT_PRESETS = [
  {
    id: 'points_100',
    pointsWeight: 1,
    labelKey: '🎯 100/0 - Maximum Points',
  },
  {
    id: 'points_90',
    pointsWeight: 0.9,
    labelKey: '⚖️ 90/10 - Strong Points Bias',
  },
  {
    id: 'points_80',
    pointsWeight: 0.8,
    labelKey: '📊 80/20 - Points Focused',
  },
  {
    id: 'points_70',
    pointsWeight: 0.7,
    labelKey: '🤝 70/30 - Balanced with Points Edge',
  },
];

async function handleSetBestTeamWeights(bot, msg) {
  const chatId = msg.chat.id;
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const inline_keyboard = BEST_TEAM_WEIGHT_PRESETS.map((preset) => [
    {
      text: t(preset.labelKey, chatId),
      callback_data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:${teamId}:${preset.id}`,
    },
  ]);

  await bot.sendMessage(chatId, t('Choose best-team ranking preference:', chatId), {
    reply_markup: { inline_keyboard },
  });
}

module.exports = { handleSetBestTeamWeights, BEST_TEAM_WEIGHT_PRESETS };
