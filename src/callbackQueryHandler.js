const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const azureStorageService = require('./azureStorageService');
const { updateUserAttributes } = require('./userRegistryService');
const {
  photoCache,
  currentTeamCache,
  constructorsCache,
  driversCache,
  getPrintableCache,
  bestTeamsCache,
  userCache,
} = require('./cache');
const { selectChip } = require('./commandsHandler/selectChipHandlers');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  NAME_TO_CODE_MAPPING,
  PHOTO_CALLBACK_TYPE,
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
  getDisplayName,
} = require('./utils');
const { handleMenuCallback } = require('./commandsHandler/menuHandler');
const { t, setLanguage, getLanguageName } = require('./i18n');
const { BEST_TEAM_WEIGHT_PRESETS } = require('./commandsHandler/setBestTeamWeightsHandler');

exports.handleCallbackQuery = async function (bot, query) {
  const callbackType = query.data.split(':')[0];

  switch (callbackType) {
    case PHOTO_CALLBACK_TYPE:
      return await handlePhotoCallback(bot, query);
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
      return await handleBestTeamWeightsCallback(bot, query);
    default:
      await sendLogMessage(bot, `Unknown callback type: ${callbackType}`);
  }
};

async function handlePhotoCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [_, type, fileId] = query.data.split(':');
  const displayName = getDisplayName(chatId);

  // Save or process the selection (just logging here)
  console.log(
    `User ${displayName} (${chatId}) labeled photo ${fileId} as ${type.toUpperCase()}`,
  );

  // Optional: edit the message to confirm
  await bot.editMessageText(
    t('Photo labeled as {TYPE}. Wait for extracted JSON data...', chatId, {
      TYPE: type.toUpperCase(),
    }),
    {
      chat_id: chatId,
      message_id: messageId,
    },
  );

  // Answer callback to remove "Loading..." spinner
  await bot.answerCallbackQuery(query.id);

  const fileDetails = photoCache[fileId];
  try {
    const fileLink = await bot.getFileLink(fileDetails.fileId);

    const extractedData = await extractJsonDataFromPhotos(bot, type, [
      fileLink,
    ]);

    const teamId = await storeInCache(bot, chatId, type, extractedData, fileId);

    // Invalidate best teams cache for the specific team (or all if no teamId yet)
    if (teamId && bestTeamsCache[chatId]) {
      delete bestTeamsCache[chatId][teamId];
    }

    // Only send printable cache if storage happened (teamId resolved)
    if (teamId) {
      await sendMessageToUser(bot, chatId, getPrintableCache(chatId, type), {
        useMarkdown: true,
        errorMessageToLog: 'Error sending extracted data to user',
      });
    }
  } catch (err) {
    sendLogMessage(bot, `Error extracting data from photo: ${err.message}`);
    sendMessageToUser(
      bot,
      chatId,
      t('An error occurred while extracting data from the photo.', chatId),
      { errorMessageToLog: 'Error sending extraction error message' },
    );
  }
}

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


async function handleBestTeamWeightsCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.split(':')[1];
  const presetId = query.data.split(':')[2];

  const preset = BEST_TEAM_WEIGHT_PRESETS.find((option) => option.id === presetId);

  if (!preset) {
    await bot.answerCallbackQuery(query.id);

    return;
  }

  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  if (!userCache[key].bestTeamWeights) {
    userCache[key].bestTeamWeights = {};
  }
  userCache[key].bestTeamWeights[teamId] = preset.priceChangeWeight;

  await updateUserAttributes(chatId, {
    bestTeamWeights: JSON.stringify(userCache[key].bestTeamWeights),
  });

  // Invalidate cached best teams for this team because ranking logic changed
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  const confirmationMessage =
    `${t('Best team weights set: points {POINTS}% | price change {PRICE}%.', chatId, {
      POINTS: Number((preset.pointsWeight * 100).toFixed(0)),
      PRICE: Number((preset.priceChangeWeight * 100).toFixed(0)),
    })}
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

/**
 * Stores extracted photo data in the appropriate cache.
 * Returns the teamId if storage happened, or null if deferred (pending team assignment).
 */
// eslint-disable-next-line max-params
async function storeInCache(bot, chatId, type, extractedData, fileUniqueId) {
  const cleanedJsonString = extractedData
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '');

  console.log('[DEBUG] Raw extractedData:', extractedData);
  console.log('[DEBUG] cleanedJsonString:', cleanedJsonString);

  let jsonObject;
  try {
    jsonObject = JSON.parse(cleanedJsonString);
    console.log(
      '[DEBUG] Parsed jsonObject keys:',
      jsonObject ? Object.keys(jsonObject) : 'null/undefined',
    );
    console.log(
      '[DEBUG] Full parsed jsonObject:',
      JSON.stringify(jsonObject, null, 2),
    );
  } catch (err) {
    console.error('[DEBUG] JSON.parse FAILED. Error:', err.message);
    console.error('[DEBUG] jsonObject after failed parse:', jsonObject);
  }

  if (type === DRIVERS_PHOTO_TYPE) {
    driversCache[chatId] = {
      ...driversCache[chatId],
    };

    for (const driver of jsonObject.Drivers) {
      driversCache[chatId][driver.DR] = driver;
    }

    return null;
  }
  if (type === CONSTRUCTORS_PHOTO_TYPE) {
    constructorsCache[chatId] = {
      ...constructorsCache[chatId],
    };
    for (const constructor of jsonObject.Constructors) {
      constructorsCache[chatId][constructor.CN] = constructor;
    }

    return null;
  }
  if (type === CURRENT_TEAM_PHOTO_TYPE) {
    // Convert drivers and constructors to code names
    const mapToCodeName = (name) =>
      NAME_TO_CODE_MAPPING[name.toLowerCase()] || name;

    jsonObject.CurrentTeam.drivers =
      jsonObject.CurrentTeam.drivers.map(mapToCodeName);
    jsonObject.CurrentTeam.constructors =
      jsonObject.CurrentTeam.constructors.map(mapToCodeName);
    jsonObject.CurrentTeam.drsBoost = mapToCodeName(
      jsonObject.CurrentTeam.drsBoost,
    );

    // Extract teamId from AI response
    const teamId = jsonObject.CurrentTeam.teamId || null;

    // Remove teamId from team data (it's metadata, not team data)
    const { teamId: _removedTeamId, ...teamDataWithoutId } =
      jsonObject.CurrentTeam;

    if (!teamId) {
      // AI couldn't extract teamId — store in Azure Blob and ask user to assign
      const uniqueKey = fileUniqueId || String(Date.now());
      await azureStorageService.savePendingTeamAssignment(
        chatId,
        uniqueKey,
        teamDataWithoutId,
      );

      const keyboard = [
        ['T1', 'T2', 'T3'].map((tid) => ({
          text: tid,
          callback_data: `${TEAM_ASSIGN_CALLBACK_TYPE}:${uniqueKey}:${tid}`,
        })),
      ];

      await bot.sendMessage(
        chatId,
        t('Which team is this screenshot from?', chatId),
        { reply_markup: { inline_keyboard: keyboard } },
      );

      return null; // Storage deferred
    }

    // teamId is present — store directly
    if (!currentTeamCache[chatId]) {
      currentTeamCache[chatId] = {};
    }
    currentTeamCache[chatId][teamId] = teamDataWithoutId;

    // Persist to blob storage
    await azureStorageService.saveUserTeam(
      bot,
      chatId,
      teamId,
      teamDataWithoutId,
    );

    // Auto-select this team
    const key = String(chatId);
    if (!userCache[key]) {
      userCache[key] = {};
    }
    userCache[key].selectedTeam = teamId;
    await updateUserAttributes(chatId, { selectedTeam: teamId });

    // Notify about auto-switch
    await sendMessageToUser(
      bot,
      chatId,
      t('🔄 Active team auto-switched to {TEAM}.', chatId, { TEAM: teamId }),
      { errorMessageToLog: 'Error sending auto-switch message' },
    );

    return teamId;
  }

  console.error('Unknown photo type:', type);

  return null;
}
