const { extractJsonDataFromPhotos } = require('./jsonDataExtraction');
const {
  photoCache,
  currentTeamCache,
  constructorsCache,
  driversCache,
} = require('./cache');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');
const js = require('@eslint/js');

exports.handleCallbackQuery = async function (bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [type, fileId] = query.data.split(':');

  // Save or process the selection (just logging here)
  console.log(
    `User ${
      query.from.username
    } labeled photo ${fileId} as ${type.toUpperCase()}`
  );

  // Optional: edit the message to confirm
  bot.editMessageText(
    `Photo labeled as ${type.toUpperCase()}. Wait for extracted JSON data...`,
    {
      chat_id: chatId,
      message_id: messageId,
    }
  );

  // Answer callback to remove "Loading..." spinner
  bot.answerCallbackQuery(query.id);

  const fileDetails = photoCache[fileId];
  try {
    const fileLink = await bot.getFileLink(fileDetails.fileId);

    const extractedData = await extractJsonDataFromPhotos(type, [fileLink]);

    const dataFromCache = storeInCache(chatId, type, extractedData);
    // TODO - store in cache

    bot
      .sendMessage(
        chatId,
        `\`\`\`json
${JSON.stringify(dataFromCache, null, 2)}\`\`\``,
        {
          parse_mode: 'Markdown',
        }
      )
      .catch((err) => console.error('Error sending extracted data:', err));
  } catch (err) {
    console.error('Error extracting data from photo:', err);
    bot
      .sendMessage(
        chatId,
        'An error occurred while extracting data from the photo.'
      )
      .catch((err) =>
        console.error('Error sending extraction error message:', err)
      );
  }
};

function storeInCache(chatId, type, extractedData) {
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
    return driversCache[chatId];
  } else if (type === CONSTRUCTORS_PHOTO_TYPE) {
    constructorsCache[chatId] = {
      ...constructorsCache[chatId],
    };
    for (const constructor of jsonObject.Constructors) {
      constructorsCache[chatId][constructor.CN] = constructor;
    }

    return constructorsCache[chatId];
    // Store in constructors cache
  } else if (type === CURRENT_TEAM_PHOTO_TYPE) {
    currentTeamCache[chatId] = {
      ...currentTeamCache[chatId],
      ...jsonObject.CurrentTeam,
    };

    return currentTeamCache[chatId];
    // Store in current team cache
  } else {
    console.error('Unknown photo type:', type);
  }
}
