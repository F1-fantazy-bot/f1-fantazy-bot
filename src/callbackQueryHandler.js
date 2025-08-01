const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const azureStorageService = require('./azureStorageService');
const {
  photoCache,
  currentTeamCache,
  constructorsCache,
  driversCache,
  getPrintableCache,
  bestTeamsCache,
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
} = require('./constants');

const { sendLogMessage, sendMessageToUser } = require('./utils');
const { handleMenuCallback } = require('./commandsHandler/menuHandler');
const { t, setLanguage, getLanguageName } = require('./i18n');

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
    default:
      await sendLogMessage(bot, `Unknown callback type: ${callbackType}`);
  }
};

async function handlePhotoCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [_, type, fileId] = query.data.split(':');

  // Save or process the selection (just logging here)
  console.log(
    `User ${chatId} labeled photo ${fileId} as ${type.toUpperCase()}`
  );

  // Optional: edit the message to confirm
  await bot.editMessageText(
    t('Photo labeled as {TYPE}. Wait for extracted JSON data...', chatId, {
      TYPE: type.toUpperCase(),
    }),
    {
      chat_id: chatId,
      message_id: messageId,
    }
  );

  // Answer callback to remove "Loading..." spinner
  await bot.answerCallbackQuery(query.id);

  const fileDetails = photoCache[fileId];
  try {
    const fileLink = await bot.getFileLink(fileDetails.fileId);

    const extractedData = await extractJsonDataFromPhotos(bot, type, [
      fileLink,
    ]);

    await storeInCache(bot, chatId, type, extractedData);
    delete bestTeamsCache[chatId];

    await sendMessageToUser(bot, chatId, getPrintableCache(chatId, type), {
      useMarkdown: true,
      errorMessageToLog: 'Error sending extracted data to user',
    });
  } catch (err) {
    sendLogMessage(bot, `Error extracting data from photo: ${err.message}`);
    sendMessageToUser(
      bot,
      chatId,
      t('An error occurred while extracting data from the photo.', chatId),
      { errorMessageToLog: 'Error sending extraction error message' }
    );
  }
}
async function handleChipCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const chip = query.data.split(':')[1];

  const message = selectChip(chatId, chip);

  await bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
  });

  // Answer callback to remove "Loading..." spinner
  await bot.answerCallbackQuery(query.id);
}

async function handleLanguageCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const lang = query.data.split(':')[1];

  setLanguage(lang, chatId);
  await azureStorageService.saveUserSettings(bot, chatId, { lang });

  await bot.editMessageText(
    t('Language changed to {LANG}.', chatId, {
      LANG: getLanguageName(lang, chatId),
    }),
    {
      chat_id: chatId,
      message_id: messageId,
    }
  );

  await bot.answerCallbackQuery(query.id);
}

async function storeInCache(bot, chatId, type, extractedData) {
  const cleanedJsonString = extractedData
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '');

  let jsonObject;
  try {
    jsonObject = JSON.parse(cleanedJsonString);
  } catch (err) {
    console.error('Error parsing JSON:', err);
  }

  if (type === DRIVERS_PHOTO_TYPE) {
    driversCache[chatId] = {
      ...driversCache[chatId],
    };

    for (const driver of jsonObject.Drivers) {
      driversCache[chatId][driver.DR] = driver;
    }

    return;
  }
  if (type === CONSTRUCTORS_PHOTO_TYPE) {
    constructorsCache[chatId] = {
      ...constructorsCache[chatId],
    };
    for (const constructor of jsonObject.Constructors) {
      constructorsCache[chatId][constructor.CN] = constructor;
    }

    return;
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
      jsonObject.CurrentTeam.drsBoost
    );

    const updatedTeam = {
      ...currentTeamCache[chatId],
      ...jsonObject.CurrentTeam,
    };

    currentTeamCache[chatId] = updatedTeam;
    await azureStorageService.saveUserTeam(bot, chatId, updatedTeam);

    return;
  }

  console.error('Unknown photo type:', type);
}
