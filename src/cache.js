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

// In-memory cache for simulation info (name and last update)
exports.simulationInfoCache = {};

exports.selectedChipCache = {};

// In-memory cache for language by chat id
exports.languageCache = {};

// In-memory cache for next race info
exports.nextRaceInfoCache = {};
// In-memory cache for weather forecast
exports.weatherForecastCache = {};

exports.getPrintableCache = function (chatId, type) {
  const driversData = exports.driversCache[chatId];
  const constructorsData = exports.constructorsCache[chatId];
  const currentTeamData = exports.currentTeamCache[chatId];

  // Handle the default scenario when no specific type is provided
  if (!type) {
    const jsonData = {
      Drivers: Object.values(driversData || {}),
      Constructors: Object.values(constructorsData || {}),
      ...(chatId !== exports.sharedKey && {
        CurrentTeam: currentTeamData || {},
      }),
    };

    return wrapWithCodeBlock(JSON.stringify(jsonData, null, 2));
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
