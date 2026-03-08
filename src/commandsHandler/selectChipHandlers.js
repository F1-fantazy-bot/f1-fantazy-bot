const {
  selectedChipCache,
  bestTeamsCache,
  resolveSelectedTeam,
} = require('../cache');
const {
  EXTRA_DRS_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
  WITHOUT_CHIP,
  COMMAND_BEST_TEAMS,
} = require('../constants');
const { t } = require('../i18n');

async function selectChip(bot, chatId, chip) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return null;
  }

  const isThereDataInBestTeamsCache =
    bestTeamsCache[chatId]?.[teamId] &&
    bestTeamsCache[chatId][teamId].bestTeams;

  if (chip === WITHOUT_CHIP) {
    if (selectedChipCache[chatId]) {
      delete selectedChipCache[chatId][teamId];
    }
  } else {
    if (!selectedChipCache[chatId]) {
      selectedChipCache[chatId] = {};
    }
    selectedChipCache[chatId][teamId] = chip;
  }

  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  let message = t('Selected chip: {CHIP}.', chatId, {
    CHIP: chip.toUpperCase(),
  });

  if (isThereDataInBestTeamsCache) {
    message +=
      '\n' +
      t(
        'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.',
        chatId,
        { CMD: COMMAND_BEST_TEAMS },
      );
  }

  return message;
}

async function sendChipSelection(bot, chatId, chip) {
  const message = await selectChip(bot, chatId, chip);
  if (message) {
    await bot.sendMessage(chatId, message);
  }
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
