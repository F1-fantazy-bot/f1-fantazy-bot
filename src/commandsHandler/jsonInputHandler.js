const { validateJsonData } = require('../utils');
const azureStorageService = require('../azureStorageService');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  userCache,
  getSelectedTeam,
  getUserTeamIds,
} = require('../cache');
const { updateUserAttributes } = require('../userRegistryService');
const { sendPrintableCache } = require('./printCacheHandler');
const { t } = require('../i18n');

// Handles the case when the message text is JSON data
async function handleJsonMessage(bot, chatId, jsonData) {
  const hasDriversData = Array.isArray(jsonData.Drivers);
  const hasConstructorsData = Array.isArray(jsonData.Constructors);
  const hasCurrentTeam = !!jsonData.CurrentTeam;

  if (hasDriversData || hasConstructorsData) {
    if (!(await validateJsonData(bot, jsonData, chatId))) {
      return;
    }

    driversCache[chatId] = Object.fromEntries(
      jsonData.Drivers.map((driver) => [driver.DR, driver]),
    );
    constructorsCache[chatId] = Object.fromEntries(
      jsonData.Constructors.map((constructor) => [constructor.CN, constructor]),
    );

    if (hasCurrentTeam) {
      const teamId = await resolveTeamIdForJson(
        bot,
        chatId,
        jsonData.CurrentTeam,
      );
      if (teamId) {
        const { teamId: _removedTeamId, ...teamDataWithoutId } =
          jsonData.CurrentTeam;
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

        // Auto-select this team
        const key = String(chatId);
        if (!userCache[key]) {
          userCache[key] = {};
        }
        userCache[key].selectedTeam = teamId;
        await updateUserAttributes(chatId, { selectedTeam: teamId });

        // Invalidate best teams for this team
        if (bestTeamsCache[chatId]) {
          delete bestTeamsCache[chatId][teamId];
        }
      }
    }
  } else if (hasCurrentTeam) {
    if (!(await validateJsonData(bot, jsonData, chatId, true, false))) {
      return;
    }

    const teamId = await resolveTeamIdForJson(
      bot,
      chatId,
      jsonData.CurrentTeam,
    );
    if (teamId) {
      const { teamId: _removedTeamId, ...teamDataWithoutId } =
        jsonData.CurrentTeam;
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

      // Auto-select this team
      const key = String(chatId);
      if (!userCache[key]) {
        userCache[key] = {};
      }
      userCache[key].selectedTeam = teamId;
      await updateUserAttributes(chatId, { selectedTeam: teamId });

      // Invalidate best teams for this team
      if (bestTeamsCache[chatId]) {
        delete bestTeamsCache[chatId][teamId];
      }
    }
  } else if (!(await validateJsonData(bot, jsonData, chatId))) {
    return;
  }

  await sendPrintableCache(chatId, bot);
}

/**
 * Resolves teamId for JSON input.
 * Checks jsonData.teamId first, then selected team, then defaults to 'T1' for first-time users.
 */
async function resolveTeamIdForJson(bot, chatId, currentTeamData) {
  // If the JSON explicitly includes a teamId, use it
  if (currentTeamData.teamId) {
    return currentTeamData.teamId;
  }

  // If the user has a selected team, use it
  const selectedTeam = getSelectedTeam(chatId);
  if (selectedTeam) {
    return selectedTeam;
  }

  // If user has exactly one team, use it
  const teamIds = getUserTeamIds(chatId);
  if (teamIds.length === 1) {
    return teamIds[0];
  }

  // If user has multiple teams and no selection, ask them
  if (teamIds.length > 1) {
    await bot.sendMessage(
      chatId,
      t(
        'You have multiple teams. Please run /select_team to choose your active team.',
        chatId,
      ),
    );

    return null;
  }

  // No teams exist yet — default to T1 for a new user
  return 'T1';
}

module.exports = { handleJsonMessage };
