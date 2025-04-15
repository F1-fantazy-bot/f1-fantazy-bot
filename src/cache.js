const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

// In-memory cache for photos by unique file id
exports.photoCache = {};

// In-memory cache for best teams by chat id
exports.bestTeamsCache = {};

// In-memory cache for drivers by chat id
exports.driversCache = {};

// In-memory cache for constructors by chat id
exports.constructorsCache = {};

// In-memory cache for current team by chat id
exports.currentTeamCache = {};

exports.getPrintableCache = function (chatId, type) {
  if (type === DRIVERS_PHOTO_TYPE) {
    const data = exports.driversCache[chatId];
    return wrapWithCodeBlock(JSON.stringify(Object.values(data), null, 2));
  }
  if (type === CONSTRUCTORS_PHOTO_TYPE) {
    const data = exports.constructorsCache[chatId];
    return wrapWithCodeBlock(JSON.stringify(Object.values(data), null, 2));
  }
  if (type === CURRENT_TEAM_PHOTO_TYPE) {
    const data = exports.currentTeamCache[chatId];
    return wrapWithCodeBlock(JSON.stringify(data, null, 2));
  }

  return null;
};

function wrapWithCodeBlock(text) {
  return `\`\`\`json
${text}
\`\`\``;
}
