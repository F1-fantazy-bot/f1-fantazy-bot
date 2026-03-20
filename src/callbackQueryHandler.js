const azureStorageService = require('./azureStorageService');
const { updateUserAttributes } = require('./userRegistryService');
const {
  currentTeamCache,
  getPrintableCache,
  bestTeamsCache,
  userCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
} = require('./cache');
const { selectChip } = require('./commandsHandler/selectChipHandlers');
const {
  CURRENT_TEAM_PHOTO_TYPE,
  CHIP_CALLBACK_TYPE,
  MENU_CALLBACK_TYPE,
  LANG_CALLBACK_TYPE,
  TEAM_CALLBACK_TYPE,
  TEAM_ASSIGN_CALLBACK_TYPE,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
} = require('./constants');

const {
  sendLogMessage,
  sendMessageToUser,
} = require('./utils');
const { handleMenuCallback } = require('./commandsHandler/menuHandler');
const { t, setLanguage, getLanguageName } = require('./i18n');
const {
  BEST_TEAM_RANKING_PRESETS,
} = require('./commandsHandler/setBestTeamRankingHandler');

exports.handleCallbackQuery = async function (bot, query) {
  const callbackType = query.data.split(':')[0];

  switch (callbackType) {
    case CHIP_CALLBACK_TYPE:
      return await handleChipCallback(bot, query);
    case LANG_CALLBACK_TYPE:
      return await handleLanguageCallback(bot, query);
    case MENU_CALLBACK_TYPE:
      return await handleMenuCallback(bot, query);
    case TEAM_CALLBACK_TYPE:
      return await handleTeamCallback(bot, query);
    case TEAM_ASSIGN_CALLBACK_TYPE:
      return await handleTeamAssignCallback(bot, query);
    case BEST_TEAM_WEIGHTS_CALLBACK_TYPE:
      return await handleBestTeamRankingCallback(bot, query);
    default:
      await sendLogMessage(bot, `Unknown callback type: ${callbackType}`);
  }
};

async function handleChipCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const chip = query.data.split(':')[1];

  const message = await selectChip(bot, chatId, chip);

  if (message) {
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  // Answer callback to remove "Loading..." spinner
  await bot.answerCallbackQuery(query.id);
}

async function handleLanguageCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const lang = query.data.split(':')[1];

  setLanguage(lang, chatId);
  await updateUserAttributes(chatId, { lang });

  await bot.editMessageText(
    t('Language changed to {LANG}.', chatId, {
      LANG: getLanguageName(lang, chatId),
    }),
    {
      chat_id: chatId,
      message_id: messageId,
    },
  );

  await bot.answerCallbackQuery(query.id);
}


async function handleBestTeamRankingCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.split(':')[1];
  const presetId = query.data.split(':')[2];

  const preset = BEST_TEAM_RANKING_PRESETS.find((option) => option.id === presetId);

  if (!preset) {
    await bot.answerCallbackQuery(query.id);

    return;
  }

  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  const bestTeamBudgetChangePointsPerMillion =
    normalizeBestTeamBudgetChangePointsPerMillion(
      userCache[key].bestTeamBudgetChangePointsPerMillion,
    );

  bestTeamBudgetChangePointsPerMillion[teamId] =
    preset.budgetChangePointsPerMillion;
  userCache[key].bestTeamBudgetChangePointsPerMillion =
    bestTeamBudgetChangePointsPerMillion;

  await updateUserAttributes(chatId, {
    bestTeamBudgetChangePointsPerMillion: JSON.stringify(
      bestTeamBudgetChangePointsPerMillion,
    ),
  });

  // Invalidate cached best teams for this team because ranking logic changed
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  const confirmationMessage =
    `${t(
      'Best-team ranking set: {LABEL} ({VALUE} pts per 1M per remaining race).',
      chatId,
      {
        LABEL: t(preset.labelKey, chatId),
        VALUE: preset.budgetChangePointsPerMillion,
      },
    )}
` +
    t(
      'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.',
      chatId,
      { CMD: '/best_teams' },
    );

  await bot.editMessageText(confirmationMessage, {
    chat_id: chatId,
    message_id: messageId,
  });

  await bot.answerCallbackQuery(query.id);
}

async function handleTeamCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.split(':')[1];

  // Update selection in memory
  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedTeam = teamId;

  // Persist selection
  await updateUserAttributes(chatId, { selectedTeam: teamId });

  // Edit message to confirm
  await bot.editMessageText(
    t('Active team switched to {TEAM}.', chatId, { TEAM: teamId }),
    { chat_id: chatId, message_id: messageId },
  );
  await bot.answerCallbackQuery(query.id);
}

async function handleTeamAssignCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [_, uniqueKey, teamId] = query.data.split(':');

  // Retrieve temporarily stored team data from Azure Blob Storage
  const teamData = await azureStorageService.getPendingTeamAssignment(
    chatId,
    uniqueKey,
  );
  if (!teamData) {
    await bot.editMessageText(
      t('An error occurred while extracting data from the photo.', chatId),
      { chat_id: chatId, message_id: messageId },
    );
    await bot.answerCallbackQuery(query.id);

    return;
  }
  await azureStorageService.deletePendingTeamAssignment(chatId, uniqueKey);

  // Store in cache (team-scoped)
  if (!currentTeamCache[chatId]) {
    currentTeamCache[chatId] = {};
  }
  currentTeamCache[chatId][teamId] = teamData;

  // Persist to blob storage
  await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);

  // Auto-select this team
  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedTeam = teamId;
  await updateUserAttributes(chatId, { selectedTeam: teamId });

  // Invalidate best teams for this team
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  // Edit message to confirm
  await bot.editMessageText(
    t('Selected Team: {TEAM}', chatId, { TEAM: teamId }),
    { chat_id: chatId, message_id: messageId },
  );

  // Notify about auto-switch
  await sendMessageToUser(
    bot,
    chatId,
    t('🔄 Active team auto-switched to {TEAM}.', chatId, { TEAM: teamId }),
    { errorMessageToLog: 'Error sending auto-switch message' },
  );

  // Send printable cache
  await sendMessageToUser(
    bot,
    chatId,
    getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE),
    {
      useMarkdown: true,
      errorMessageToLog: 'Error sending extracted data to user',
    },
  );

  await bot.answerCallbackQuery(query.id);
}
