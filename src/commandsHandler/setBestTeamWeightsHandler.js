const { t } = require('../i18n');
const { BEST_TEAM_WEIGHTS_CALLBACK_TYPE } = require('../constants');

const BEST_TEAM_WEIGHT_PRESETS = [
  {
    id: 'favor_points',
    pointsWeight: 1,
    priceChangeWeight: 0,
    labelKey: '🎯 Favor Points (100/0)',
  },
  {
    id: 'balanced_points',
    pointsWeight: 0.75,
    priceChangeWeight: 0.25,
    labelKey: '⚖️ Lean Points (75/25)',
  },
  {
    id: 'balanced',
    pointsWeight: 0.5,
    priceChangeWeight: 0.5,
    labelKey: '🤝 Balanced (50/50)',
  },
  {
    id: 'balanced_price',
    pointsWeight: 0.25,
    priceChangeWeight: 0.75,
    labelKey: '💹 Lean Price Change (25/75)',
  },
  {
    id: 'favor_price',
    pointsWeight: 0,
    priceChangeWeight: 1,
    labelKey: '📈 Favor Price Change (0/100)',
  },
];

async function handleSetBestTeamWeights(bot, msg) {
  const chatId = msg.chat.id;

  const inline_keyboard = BEST_TEAM_WEIGHT_PRESETS.map((preset) => [
    {
      text: t(preset.labelKey, chatId),
      callback_data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:${preset.id}`,
    },
  ]);

  await bot.sendMessage(chatId, t('Choose best-team ranking preference:', chatId), {
    reply_markup: { inline_keyboard },
  });
}

module.exports = { handleSetBestTeamWeights, BEST_TEAM_WEIGHT_PRESETS };
