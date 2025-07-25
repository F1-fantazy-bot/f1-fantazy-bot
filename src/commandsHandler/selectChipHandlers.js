const { selectedChipCache, bestTeamsCache } = require('../cache');
const {
  EXTRA_DRS_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
  WITHOUT_CHIP,
  COMMAND_BEST_TEAMS,
} = require('../constants');
const { t } = require('../i18n');

function selectChip(chatId, chip) {
  const isThereDataInBestTeamsCache =
    bestTeamsCache[chatId] && bestTeamsCache[chatId].bestTeams;

  if (chip === WITHOUT_CHIP) {
    delete selectedChipCache[chatId];
  } else {
    selectedChipCache[chatId] = chip;
  }

  delete bestTeamsCache[chatId];

  let message = t('Selected chip: {CHIP}.', chatId, { CHIP: chip.toUpperCase() });

  if (isThereDataInBestTeamsCache) {
    message +=
      '\n' +
      t(
        'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.',
        chatId,
        { CMD: COMMAND_BEST_TEAMS }
      );
  }

  return message;
}

async function sendChipSelection(bot, chatId, chip) {
  const message = selectChip(chatId, chip);
  await bot.sendMessage(chatId, message);
}

async function handleSelectExtraDrs(bot, msg) {
  await sendChipSelection(bot, msg.chat.id, EXTRA_DRS_CHIP);
}

async function handleSelectLimitless(bot, msg) {
  await sendChipSelection(bot, msg.chat.id, LIMITLESS_CHIP);
}

async function handleSelectWildcard(bot, msg) {
  await sendChipSelection(bot, msg.chat.id, WILDCARD_CHIP);
}

async function handleResetChip(bot, msg) {
  await sendChipSelection(bot, msg.chat.id, WITHOUT_CHIP);
}

module.exports = {
  handleSelectExtraDrs,
  handleSelectLimitless,
  handleSelectWildcard,
  handleResetChip,
  selectChip,
};
