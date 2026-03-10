const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

exports.sharedKey = 'defaultSharedKey';
// In-memory cache for photos by unique file id
exports.photoCache = {};

// In-memory cache for best teams by chat id
// Structure: bestTeamsCache[chatId] = { T1: { currentTeam, bestTeams }, T2: { ... } }
exports.bestTeamsCache = {};

// In-memory cache for drivers by chat id
exports.driversCache = {};

// In-memory cache for constructors by chat id
exports.constructorsCache = {};

// In-memory cache for current team by chat id
// Structure: currentTeamCache[chatId] = { T1: { drivers, ... }, T2: { drivers, ... } }
exports.currentTeamCache = {};

// In-memory cache for simulation info (name and last update)
exports.simulationInfoCache = {};

// Structure: selectedChipCache[chatId] = { T1: 'EXTRA_DRS', T2: 'WILDCARD' }
exports.selectedChipCache = {};

// In-memory cache for user data by chat id
// Each entry: { lang, nickname, chatName, selectedTeam, ... }
exports.userCache = {};

// In-memory cache for next race info
exports.nextRaceInfoCache = {};
// In-memory cache for weather forecast
exports.weatherForecastCache = {};

const DEFAULT_BEST_TEAM_WEIGHTS = {
  pointsWeight: 1,
  priceChangeWeight: 0,
};

exports.DEFAULT_BEST_TEAM_WEIGHTS = DEFAULT_BEST_TEAM_WEIGHTS;

exports.normalizeBestTeamPointsWeights = function (rawBestTeamPointsWeights) {
  if (!rawBestTeamPointsWeights) {
    return {};
  }

  if (typeof rawBestTeamPointsWeights === 'string') {
    try {
      const parsed = JSON.parse(rawBestTeamPointsWeights);

      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof rawBestTeamPointsWeights === 'object'
    ? rawBestTeamPointsWeights
    : {};
};

const currentTeamCache = exports.currentTeamCache;
const userCache = exports.userCache;

exports.getSelectedTeam = function (chatId) {
  const key = String(chatId);

  return userCache[key]?.selectedTeam || null;
};

exports.getUserTeamIds = function (chatId) {
  return Object.keys(currentTeamCache[chatId] || {});
};

exports.getBestTeamWeights = function (chatId, teamId) {
  const key = String(chatId);
  const bestTeamPointsWeights = exports.normalizeBestTeamPointsWeights(
    userCache[key]?.bestTeamPointsWeights,
  );

  const pointsWeight = Number(bestTeamPointsWeights?.[teamId]);

  if (Number.isNaN(pointsWeight)) {
    return { ...DEFAULT_BEST_TEAM_WEIGHTS };
  }

  const normalizedPointsWeight = Math.max(0, Math.min(1, pointsWeight));

  return {
    pointsWeight: normalizedPointsWeight,
    priceChangeWeight: 1 - normalizedPointsWeight,
  };
};

/**
 * Resolves which team to use for team-related commands.
 * Returns the teamId string, or null if the user needs to take action first.
 * When null is returned, an appropriate message has already been sent to the user.
 */
exports.resolveSelectedTeam = async function (bot, chatId) {
  // Lazy require to avoid circular dependency (i18n requires cache)
  const { t } = require('./i18n');

  const teamIds = exports.getUserTeamIds(chatId);

  if (teamIds.length === 0) {
    await bot.sendMessage(
      chatId,
      t('No teams found. Please upload a team screenshot first.', chatId),
    );

    return null;
  }

  if (teamIds.length === 1) {
    return teamIds[0];
  }

  const selectedTeam = exports.getSelectedTeam(chatId);
  if (selectedTeam && teamIds.includes(selectedTeam)) {
    return selectedTeam;
  }

  await bot.sendMessage(
    chatId,
    t(
      'You have multiple teams. Please run /select_team to choose your active team.',
      chatId,
    ),
  );

  return null;
};

exports.getPrintableCache = function (chatId, type) {
  const driversData = exports.driversCache[chatId];
  const constructorsData = exports.constructorsCache[chatId];
  const teamsData = exports.currentTeamCache[chatId];

  // Handle the default scenario when no specific type is provided
  if (!type) {
    // Build teams object with chip field included in each team entry, sorted by team ID
    const teams = {};
    if (teamsData && chatId !== exports.sharedKey) {
      const sortedTeamIds = Object.keys(teamsData).sort();
      for (const teamId of sortedTeamIds) {
        const teamData = teamsData[teamId];
        const chip = exports.selectedChipCache[chatId]?.[teamId];
        const bestTeamPointsWeight = exports.getBestTeamWeights(
          chatId,
          teamId,
        ).pointsWeight;
        teams[teamId] = {
          ...teamData,
          ...(chip ? { chip } : {}),
          bestTeamPointsWeight,
        };
      }
    }

    const jsonData = {
      Drivers: Object.values(driversData || {}),
      Constructors: Object.values(constructorsData || {}),
      ...(chatId !== exports.sharedKey && {
        SelectedTeam: exports.getSelectedTeam(chatId),
        Teams: teams,
      }),
    };

    return wrapWithCodeBlock(JSON.stringify(jsonData, null, 2));
  }

  if (type === DRIVERS_PHOTO_TYPE) {
    if (!driversData) {
      return null;
    }

    return wrapWithCodeBlock(
      JSON.stringify(Object.values(driversData), null, 2),
    );
  }

  if (type === CONSTRUCTORS_PHOTO_TYPE) {
    if (!constructorsData) {
      return null;
    }

    return wrapWithCodeBlock(
      JSON.stringify(Object.values(constructorsData), null, 2),
    );
  }

  if (type === CURRENT_TEAM_PHOTO_TYPE) {
    if (!teamsData) {
      return null;
    }

    const selectedTeam = exports.getSelectedTeam(chatId);
    if (selectedTeam && teamsData[selectedTeam]) {
      return wrapWithCodeBlock(
        JSON.stringify(teamsData[selectedTeam], null, 2),
      );
    }

    // If no selected team, show all teams data
    return wrapWithCodeBlock(JSON.stringify(teamsData, null, 2));
  }

  return null;
};

function wrapWithCodeBlock(text) {
  return `\`\`\`json
${text}
\`\`\``;
}
