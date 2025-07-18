const {
  LOG_CHANNEL_ID,
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  KILZI_CHAT_ID,
  DORSE_CHAT_ID,
} = require('../constants');

const {
  EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT,
  EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT,
  EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT,
} = require('../prompts');

exports.sendMessage = async function (bot, chatId, message) {
  if (!chatId) {
    console.error('Chat ID is not set');

    return;
  }

  await bot.sendMessage(chatId, message);
};

exports.sendLogMessage = async function (bot, logMessage) {
  if (!LOG_CHANNEL_ID) {
    console.error('LOG_CHANNEL_ID is not set');

    return;
  }

  let env = 'dev';
  if (process.env.NODE_ENV === 'production') {
    env = 'prod';
  } else if (process.env.NODE_ENV === 'test') {
    env = 'test';
  }

  let log = `BOT: ${logMessage}
env: ${env}`;

  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
    log += `
pid: ${process.pid}`;
  }

  await exports.sendMessage(bot, LOG_CHANNEL_ID, log);
};

exports.sendMessageToAdmins = async function (bot, message) {
  const adminChatIds = [KILZI_CHAT_ID, DORSE_CHAT_ID];
  const msg = `BOT: ${message}`;

  for (const chatId of adminChatIds) {
    await exports.sendMessage(bot, chatId, msg);
  }
};

exports.getChatName = function (msg) {
  if (!msg || !msg.chat) {
    return 'Unknown Chat';
  }
  if (msg.chat.title) {
    return msg.chat.title;
  }
  if (msg.chat.username) {
    return msg.chat.username;
  }
  if (msg.chat.first_name || msg.chat.last_name) {
    return `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`;
  }

  return 'Unknown Chat';
};

exports.mapPhotoTypeToSystemPrompt = {
  [DRIVERS_PHOTO_TYPE]: EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT,
  [CONSTRUCTORS_PHOTO_TYPE]: EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT,
  [CURRENT_TEAM_PHOTO_TYPE]: EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT,
};

exports.validateJsonData = async function (
  bot,
  jsonData,
  chatId = LOG_CHANNEL_ID,
  validateCurrentTeam = true
) {
  if (!jsonData.Drivers || jsonData.Drivers.length !== 20) {
    await exports.sendLogMessage(
      bot,
      `Invalid JSON data. Expected 20 drivers under "Drivers" property'.`
    );
    await bot
      .sendMessage(
        chatId,
        'Invalid JSON data. Please ensure it contains 20 drivers under "Drivers" property.'
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return false;
  }

  if (!jsonData.Constructors || jsonData.Constructors.length !== 10) {
    await exports.sendLogMessage(
      bot,
      `Invalid JSON data. Expected 10 constructors under "Constructors" property'.`
    );
    await bot
      .sendMessage(
        chatId,
        'Invalid JSON data. Please ensure it contains 10 constructors under "Constructors" property.'
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return false;
  }

  if (
    validateCurrentTeam &&
    (!jsonData.CurrentTeam ||
      !jsonData.CurrentTeam.drivers ||
      jsonData.CurrentTeam.drivers.length !== 5 ||
      !jsonData.CurrentTeam.constructors ||
      jsonData.CurrentTeam.constructors.length !== 2 ||
      !jsonData.CurrentTeam.drsBoost ||
      jsonData.CurrentTeam.freeTransfers === null ||
      jsonData.CurrentTeam.freeTransfers === undefined ||
      jsonData.CurrentTeam.costCapRemaining === null ||
      jsonData.CurrentTeam.costCapRemaining === undefined)
  ) {
    await exports.sendLogMessage(
      bot,
      `Invalid JSON data. Expected 5 drivers, 2 constructors, drsBoost, freeTransfers, and costCapRemaining properties under "CurrentTeam" property'.`
    );
    await bot
      .sendMessage(
        chatId,
        'Invalid JSON data. Please ensure it contains the required properties under "CurrentTeam" property.'
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return false;
  }

  return true;
};

// Calculate current team info: total price, overall budget (price + remaining costCap), expected points and price change
exports.calculateTeamInfo = function (team, drivers, constructors) {
  const totalPrice =
    team.drivers.reduce((sum, dr) => sum + drivers[dr].price, 0) +
    team.constructors.reduce((sum, cn) => sum + constructors[cn].price, 0);

  // Add cost remaining
  const costCapRemaining = team.costCapRemaining;
  const overallBudget = totalPrice + costCapRemaining;

  // calculate current team expected points and price change
  let teamExpectedPoints =
    team.drivers.reduce((sum, dr) => sum + drivers[dr].expectedPoints, 0) +
    team.constructors.reduce(
      (sum, cn) => sum + constructors[cn].expectedPoints,
      0
    );

  // Only add drsBoost points if it exists
  if (team.drsBoost && drivers[team.drsBoost]) {
    teamExpectedPoints += drivers[team.drsBoost].expectedPoints;
  }

  const teamPriceChange =
    team.drivers.reduce((sum, dr) => sum + drivers[dr].expectedPriceChange, 0) +
    team.constructors.reduce(
      (sum, cn) => sum + constructors[cn].expectedPriceChange,
      0
    );

  return {
    totalPrice,
    costCapRemaining,
    overallBudget,
    teamExpectedPoints,
    teamPriceChange,
  };
};

exports.triggerScraping = async function (bot, chatId) {
  const url = process.env.AZURE_LOGICAPP_TRIGGER_URL;
  if (!url) {
    await bot.sendMessage(
      chatId,
      'Error: Scraping trigger URL is not configured.'
    );

    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.isAdminMessage = function (msg) {
  if (!msg || !msg.chat || !msg.chat.id) {
    return false;
  }

  return msg.chat.id === KILZI_CHAT_ID || msg.chat.id === DORSE_CHAT_ID;
};

// Formats a Date object into { dateStr, timeStr } using locale and timezone
exports.formatDateTime = function (dateObj) {
  const locale = 'en-GB';
  const timezone = 'Asia/Jerusalem';

  const dateStr = dateObj.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });

  const timeStr = dateObj.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: timezone,
  });

  return { dateStr, timeStr };
};
