const { t } = require('../i18n');
const { updateUserAttributes } = require('../userRegistryService');
const { userCache } = require('../cache');

async function handleSetBestTeamWeights(bot, msg) {
  const chatId = msg.chat.id;
  const parts = msg.text.trim().split(/\s+/);

  if (parts.length < 3) {
    await bot.sendMessage(
      chatId,
      t(
        'Usage: /set_best_team_weights <points%> <price_change%>\nExample: /set_best_team_weights 80 20\nDefault: 100 0',
        chatId,
      ),
    );

    return;
  }

  const pointsPercent = Number(parts[1]);
  const priceChangePercent = Number(parts[2]);

  const isValid =
    Number.isFinite(pointsPercent) &&
    Number.isFinite(priceChangePercent) &&
    pointsPercent >= 0 &&
    priceChangePercent >= 0;

  if (!isValid) {
    await bot.sendMessage(
      chatId,
      t('Weights must be non-negative numbers.', chatId),
    );

    return;
  }

  const total = pointsPercent + priceChangePercent;
  if (total <= 0) {
    await bot.sendMessage(
      chatId,
      t('At least one weight must be greater than 0.', chatId),
    );

    return;
  }

  const pointsWeight = pointsPercent / total;
  const priceChangeWeight = priceChangePercent / total;

  await updateUserAttributes(chatId, {
    bestTeamPointsWeight: pointsWeight,
    bestTeamPriceChangeWeight: priceChangeWeight,
  });

  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].bestTeamPointsWeight = pointsWeight;
  userCache[key].bestTeamPriceChangeWeight = priceChangeWeight;

  await bot.sendMessage(
    chatId,
    t('Best team weights set: points {POINTS}% | price change {PRICE}%.', chatId, {
      POINTS: Number((pointsWeight * 100).toFixed(1)),
      PRICE: Number((priceChangeWeight * 100).toFixed(1)),
    }),
  );
}

module.exports = { handleSetBestTeamWeights };
