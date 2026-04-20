const {
  LOG_CHANNEL_ID,
  ERRORS_CHANNEL_ID,
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
  KILZI_CHAT_ID,
  DORSE_CHAT_ID,
  YEHONATAN_CHAT_ID,
  HAIM_CHAT_ID,
  RONGO_CHAT_ID,
  TOM_CHAT_ID,
  OMER_BAREL_CHAT_ID,
  OMER_BENBENISTY_CHAT_ID,
  ITIEL_CHAT_ID,
  IDO_KLOTZ_CHAT_ID,
  RAVIV_MAROM_CHAT_ID,
} = require('../constants');

const {
  EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT,
  EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT,
  EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT,
} = require('../prompts');
const { t, getLocale } = require('../i18n');
const { userCache } = require('../cache');
const {
  getSecret,
  SCRAPER_RUNNER_URL_SECRET,
} = require('../keyVaultService');

const normalizePrice = function (value) {
  return Math.round(value * 10) / 10;
};

exports.calculateBudgetAdjustedPoints = function (
  expectedPoints,
  expectedPriceChange,
  budgetChangePointsPerMillion = 0,
  remainingRaceCount = 0,
) {
  const normalizedBudgetChangePointsPerMillion = Number.isFinite(
    budgetChangePointsPerMillion,
  )
    ? Math.max(0, budgetChangePointsPerMillion)
    : 0;
  // The next race drives the price change itself, so only later races should
  // receive value from that budget swing when ranking teams.
  const normalizedRemainingRaceCount = Number.isFinite(remainingRaceCount)
    ? Math.max(0, remainingRaceCount - 1)
    : 0;

  return (
    expectedPoints +
    expectedPriceChange *
      normalizedRemainingRaceCount *
      normalizedBudgetChangePointsPerMillion
  );
};

const sendMessage = async function (bot, chatId, message, options) {
  if (!chatId) {
    console.error('Chat ID is not set');

    return;
  }

  await bot.sendMessage(chatId, message, options);
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

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    log += `
pid: ${process.pid}`;
  }

  console.log(log);

  try {
    await sendMessage(bot, LOG_CHANNEL_ID, log);
  } catch (error) {
    console.error(error);
  }
};

exports.sendErrorMessage = async function (bot, errorMessage) {
  // Send to the log channel (reuse sendLogMessage)
  await exports.sendLogMessage(bot, errorMessage);

  let env = 'dev';
  if (process.env.NODE_ENV === 'production') {
    env = 'prod';
  } else if (process.env.NODE_ENV === 'test') {
    env = 'test';
  }

  let log = `BOT: ${errorMessage}
env: ${env}`;

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    log += `
pid: ${process.pid}`;
  }

  try {
    await sendMessage(bot, ERRORS_CHANNEL_ID, log);
  } catch (error) {
    console.error(error);
  }
};

exports.sendMessageToAdmins = async function (bot, message) {
  const adminChatIds = [KILZI_CHAT_ID, DORSE_CHAT_ID];
  const msg = `BOT: ${message}`;

  for (const chatId of adminChatIds) {
    await sendMessage(bot, chatId, msg);
  }
};

exports.sendMessageToUser = async function (
  bot,
  chatId,
  message,
  { useMarkdown = false, errorMessageToLog = '' } = {},
) {
  let options = undefined;
  if (useMarkdown) {
    options = { parse_mode: 'Markdown' };
  }

  try {
    await sendMessage(bot, chatId, message, options);
  } catch (error) {
    console.error(error);
    await exports.sendErrorMessage(
      bot,
      `${
        errorMessageToLog ? errorMessageToLog : 'Error sending message to user'
      }. error: ${error.message}.`,
    );
  }
};

const sendPhoto = async function (bot, chatId, photo, options) {
  if (!chatId) {
    console.error('Chat ID is not set');

    return;
  }

  await bot.sendPhoto(chatId, photo, options);
};

exports.sendPhotoToUser = async function (
  bot,
  chatId,
  photoUrl,
  { errorMessageToLog = '' } = {},
) {
  try {
    await sendPhoto(bot, chatId, photoUrl);
  } catch (error) {
    console.error(error);
    await exports.sendErrorMessage(
      bot,
      `${
        errorMessageToLog ? errorMessageToLog : 'Error sending photo to user'
      }. error: ${error.message}.`,
    );
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

/**
 * Get the display name for a user in logs.
 * Checks nickname first, then the cached chat name, then falls back to String(chatId).
 * @param {number|string} chatId - The chat ID of the user
 * @returns {string} The nickname if set, otherwise the cached chatName, otherwise chatId as a string
 */
exports.getDisplayName = function (chatId) {
  const key = String(chatId);
  const user = userCache[key];

  if (!user) {
    return key;
  }

  return user.nickname || user.chatName || key;
};

exports.mapPhotoTypeToSystemPrompt = {
  [DRIVERS_PHOTO_TYPE]: EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT,
  [CONSTRUCTORS_PHOTO_TYPE]: EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT,
  [CURRENT_TEAM_PHOTO_TYPE]: EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT,
};

// eslint-disable-next-line max-params
exports.validateJsonData = async function (
  bot,
  jsonData,
  chatId = LOG_CHANNEL_ID,
  validateCurrentTeam = true,
  validateDriversAndConstructors = true,
) {
  if (
    validateDriversAndConstructors &&
    (!jsonData.Drivers || jsonData.Drivers.length !== 22)
  ) {
    await exports.sendLogMessage(
      bot,
      `Invalid JSON data. Expected 22 drivers under "Drivers" property'.`,
    );
    await bot
      .sendMessage(
        chatId,
        t(
          'Invalid JSON data. Please ensure it contains 22 drivers under "Drivers" property.',
          chatId,
        ),
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return false;
  }

  if (
    validateDriversAndConstructors &&
    (!jsonData.Constructors || jsonData.Constructors.length !== 11)
  ) {
    await exports.sendLogMessage(
      bot,
      `Invalid JSON data. Expected 11 constructors under "Constructors" property'.`,
    );
    await bot
      .sendMessage(
        chatId,
        t(
          'Invalid JSON data. Please ensure it contains 11 constructors under "Constructors" property.',
          chatId,
        ),
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
      !jsonData.CurrentTeam.boost ||
      jsonData.CurrentTeam.freeTransfers === null ||
      jsonData.CurrentTeam.freeTransfers === undefined ||
      jsonData.CurrentTeam.costCapRemaining === null ||
      jsonData.CurrentTeam.costCapRemaining === undefined)
  ) {
    await exports.sendLogMessage(
      bot,
      `Invalid JSON data. Expected 5 drivers, 2 constructors, boost, freeTransfers, and costCapRemaining properties under "CurrentTeam" property'.`,
    );
    await bot
      .sendMessage(
        chatId,
        t(
          'Invalid JSON data. Please ensure it contains the required properties under "CurrentTeam" property.',
          chatId,
        ),
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return false;
  }

  return true;
};

// Calculate current team info: total price, overall budget (price + remaining costCap), expected points and price change
exports.calculateTeamInfo = function (team, drivers, constructors) {
  const totalPrice = normalizePrice(
    team.drivers.reduce((sum, dr) => sum + drivers[dr].price, 0) +
      team.constructors.reduce((sum, cn) => sum + constructors[cn].price, 0),
  );

  // Add cost remaining
  const costCapRemaining = team.costCapRemaining;
  const overallBudget = normalizePrice(totalPrice + costCapRemaining);

  // calculate current team expected points and price change
  let teamExpectedPoints =
    team.drivers.reduce((sum, dr) => sum + drivers[dr].expectedPoints, 0) +
    team.constructors.reduce(
      (sum, cn) => sum + constructors[cn].expectedPoints,
      0,
    );

  // Only add boost points if it exists
  if (team.boost && drivers[team.boost]) {
    teamExpectedPoints += drivers[team.boost].expectedPoints;
  }

  const teamPriceChange =
    team.drivers.reduce((sum, dr) => sum + drivers[dr].expectedPriceChange, 0) +
    team.constructors.reduce(
      (sum, cn) => sum + constructors[cn].expectedPriceChange,
      0,
    );

  return {
    totalPrice,
    costCapRemaining,
    overallBudget,
    teamExpectedPoints,
    teamPriceChange,
  };
};

exports.normalizePrice = normalizePrice;

exports.triggerScraping = async function () {
  let url;
  try {
    url = await getSecret(SCRAPER_RUNNER_URL_SECRET);
  } catch (error) {
    return {
      success: false,
      error: `Failed to read scraping trigger URL from Key Vault: ${error.message}`,
    };
  }

  if (!url) {
    return {
      success: false,
      error: 'Scraping trigger URL is not configured.',
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
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

exports.isMessageFromAllowedUser = function (msg) {
  if (!msg || !msg.chat || !msg.chat.id) {
    return false;
  }

  if (exports.isAdminMessage(msg)) {
    return true;
  }

  const allowList = [
    YEHONATAN_CHAT_ID,
    HAIM_CHAT_ID,
    RONGO_CHAT_ID,
    TOM_CHAT_ID,
    OMER_BAREL_CHAT_ID,
    OMER_BENBENISTY_CHAT_ID,
    ITIEL_CHAT_ID,
    IDO_KLOTZ_CHAT_ID,
    RAVIV_MAROM_CHAT_ID,
  ];

  return allowList.includes(msg.chat.id);
};

// Formats a Date object into { dateStr, timeStr } using locale and timezone
exports.formatDateTime = function (dateObj, chatId) {
  const locale = getLocale(chatId);
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
