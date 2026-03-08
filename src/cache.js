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

const currentTeamCache = exports.currentTeamCache;
const userCache = exports.userCache;

exports.getSelectedTeam = function (chatId) {
  const key = String(chatId);

  return userCache[key]?.selectedTeam || null;
};

exports.getUserTeamIds = function (chatId) {
  return Object.keys(currentTeamCache[chatId] || {});
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
    const selectedTeam = exports.getSelectedTeam(chatId);
    const teamEntries = {};

    if (teamsData && chatId !== exports.sharedKey) {
      for (const [teamId, teamData] of Object.entries(teamsData)) {
        const marker = teamId === selectedTeam ? ' ✅' : '';
        const chipSelection = exports.selectedChipCache[chatId]?.[teamId];
        const chipInfo = chipSelection ? ` (Chip: ${chipSelection})` : '';
        teamEntries[`${teamId}${marker}${chipInfo}`] = teamData;
      }
    }

    const jsonData = {
      Drivers: Object.values(driversData || {}),
      Constructors: Object.values(constructorsData || {}),
      ...(chatId !== exports.sharedKey && {
        Teams: teamEntries,
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
