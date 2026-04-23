const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const azureStorageService = require('./azureStorageService');
const { updateUserAttributes } = require('./userRegistryService');
const {
  currentTeamCache,
  constructorsCache,
  driversCache,
  getPrintableCache,
  bestTeamsCache,
  userCache,
  clearSelectedBestTeam,
  serializeSelectedBestTeamByTeam,
} = require('./cache');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  NAME_TO_CODE_MAPPING,
  TEAM_ASSIGN_CALLBACK_TYPE,
} = require('./constants');
const { sendLogMessage, sendMessageToUser } = require('./utils');
const { t } = require('./i18n');
const {
  ensureSourceIsScreenshot,
} = require('./utils/teamSourceSwitcher');

async function processPhotoByType(
  bot,
  chatId,
  type,
  fileId,
  fileUniqueId = null,
) {
  await sendMessageToUser(
    bot,
    chatId,
    t('Please wait while data is extracted from the image.', chatId),
    { errorMessageToLog: 'Error sending extraction-in-progress message' },
  );

  const fileLink = await bot.getFileLink(fileId);
  const extractedData = await extractJsonDataFromPhotos(bot, type, [fileLink]);
  const teamId = await storeInCache(
    bot,
    chatId,
    type,
    extractedData,
    fileUniqueId,
  );

  if (teamId && bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  if (teamId || type !== CURRENT_TEAM_PHOTO_TYPE) {
    await sendMessageToUser(bot, chatId, getPrintableCache(chatId, type), {
      useMarkdown: true,
      errorMessageToLog: 'Error sending extracted data to user',
    });
  }
}

// eslint-disable-next-line max-params
async function storeInCache(bot, chatId, type, extractedData, fileUniqueId) {
  const cleanedJsonString = extractedData
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '');
  const jsonObject = JSON.parse(cleanedJsonString);

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
    const mapToCodeName = (name) =>
      NAME_TO_CODE_MAPPING[name.toLowerCase()] || name;

    jsonObject.CurrentTeam.drivers =
      jsonObject.CurrentTeam.drivers.map(mapToCodeName);
    jsonObject.CurrentTeam.constructors =
      jsonObject.CurrentTeam.constructors.map(mapToCodeName);
    jsonObject.CurrentTeam.boost = mapToCodeName(
      jsonObject.CurrentTeam.boost,
    );

    const teamId = jsonObject.CurrentTeam.teamId || null;
    const { teamId: _removedTeamId, ...teamDataWithoutId } =
      jsonObject.CurrentTeam;

    if (!teamId) {
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

      return null;
    }

    // Cross-source rule: uploading a screenshot drops any previously
    // followed league teams so the two sources never coexist.
    await ensureSourceIsScreenshot(bot, chatId);

    if (!currentTeamCache[chatId]) {
      currentTeamCache[chatId] = {};
    }
    currentTeamCache[chatId][teamId] = teamDataWithoutId;

    await azureStorageService.saveUserTeam(
      bot,
      chatId,
      teamId,
      teamDataWithoutId,
    );

    const key = String(chatId);
    if (!userCache[key]) {
      userCache[key] = {};
    }
    userCache[key].selectedTeam = teamId;
    const selectedBestTeamByTeam = clearSelectedBestTeam(chatId, teamId);
    await updateUserAttributes(chatId, {
      selectedTeam: teamId,
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        selectedBestTeamByTeam,
      ),
    });

    await sendMessageToUser(
      bot,
      chatId,
      t('🔄 Active team auto-switched to {TEAM}.', chatId, { TEAM: teamId }),
      { errorMessageToLog: 'Error sending auto-switch message' },
    );

    return teamId;
  }

  await sendLogMessage(bot, `Unknown photo type: ${type}`);

  return null;
}

module.exports = {
  processPhotoByType,
};
