const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

exports.sharedKey = 'defaultSharedKey';
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

exports.selectedChipCache = {};

exports.getPrintableCache = function (chatId, type) {
  const driversData =
    exports.driversCache[chatId] || exports.driversCache[exports.sharedKey];
  const constructorsData =
    exports.constructorsCache[chatId] ||
    exports.constructorsCache[exports.sharedKey];
  const currentTeamData = exports.currentTeamCache[chatId];

  // Handle the default scenario when no specific type is provided
  if (!type) {
    return wrapWithCodeBlock(
      JSON.stringify(
        {
          Drivers: driversData ? Object.values(driversData) : [],
          Constructors: constructorsData ? Object.values(constructorsData) : [],
          CurrentTeam: currentTeamData || {},
        },
        null,
        2
      )
    );
  }

  if (type === DRIVERS_PHOTO_TYPE) {
    if (!driversData) {
      return null;
    }

    return wrapWithCodeBlock(
      JSON.stringify(Object.values(driversData), null, 2)
    );
  }

  if (type === CONSTRUCTORS_PHOTO_TYPE) {
    if (!constructorsData) {
      return null;
    }

    return wrapWithCodeBlock(
      JSON.stringify(Object.values(constructorsData), null, 2)
    );
  }

  if (type === CURRENT_TEAM_PHOTO_TYPE) {
    if (!currentTeamData) {
      return null;
    }

    return wrapWithCodeBlock(JSON.stringify(currentTeamData, null, 2));
  }

  return null;
};

function wrapWithCodeBlock(text) {
  return `\`\`\`json
${text}
\`\`\``;
}
