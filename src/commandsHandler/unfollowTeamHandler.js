const { t } = require('../i18n');
const { isAdminMessage, sendLogMessage } = require('../utils/utils');
const azureStorageService = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { updateUserAttributes } = require('../userRegistryService');
const {
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
  clearSelectedBestTeam,
  serializeSelectedBestTeamByTeam,
  getUserLeagueTeamIds,
  getSelectedTeam,
} = require('../cache');
const {
  COMMAND_SELECT_TEAM_FROM_LEAGUE,
  COMMAND_UNFOLLOW_TEAM,
  LEAGUE_TEAM_UNFOLLOW_CALLBACK_TYPE,
} = require('../constants');

function buildLeagueNameMap(leagues) {
  const map = {};
  for (const league of leagues || []) {
    map[league.leagueCode] = league.leagueName || league.leagueCode;
  }

  return map;
}

function extractLeagueCode(teamId) {
  const separatorIdx = teamId.indexOf('_');

  return separatorIdx === -1 ? null : teamId.substring(0, separatorIdx);
}

function buildTeamLabel(chatId, teamId, leagueNameByCode) {
  const leagueCode = extractLeagueCode(teamId);
  const leagueLabel =
    (leagueCode && leagueNameByCode[leagueCode]) || leagueCode || '';
  const teamData = currentTeamCache[chatId]?.[teamId];
  const fallbackName = leagueCode
    ? teamId.substring(leagueCode.length + 1)
    : teamId;
  const teamName = teamData?.teamName || fallbackName;

  return leagueLabel ? `${teamName} — ${leagueLabel}` : teamName;
}

async function handleUnfollowTeamCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  // Running /unfollow_team clears any dangling pending-add from an aborted
  // /select_team_from_league over-cap flow, so subsequent unfollows don't
  // accidentally resume it.
  await azureStorageService.deletePendingLeagueTeamAdd(chatId);

  const teamIds = getUserLeagueTeamIds(chatId);
  if (teamIds.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'You are not following any league teams yet. Run {CMD} to follow one.',
        chatId,
        { CMD: COMMAND_SELECT_TEAM_FROM_LEAGUE },
      ),
    );

    return;
  }

  let leagues = [];
  try {
    leagues = await listUserLeagues(chatId);
  } catch (err) {
    console.error('Error listing user leagues in /unfollow_team:', err);
  }
  const leagueNameByCode = buildLeagueNameMap(leagues);

  const keyboard = teamIds.map((teamId) => [
    {
      text: buildTeamLabel(chatId, teamId, leagueNameByCode),
      callback_data: `${LEAGUE_TEAM_UNFOLLOW_CALLBACK_TYPE}:${teamId}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which team do you want to stop following?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

/**
 * Remove a followed league team from cache + blob storage and fix up
 * selectedTeam / best-team state. Shared between the /unfollow_team callback
 * and the /select_team_from_league over-cap "unfollow-then-add" flow.
 *
 * @returns {Promise<{removed: boolean, fallbackSelectedTeam: string|null}>}
 */
async function removeFollowedTeam(bot, chatId, teamId) {
  const teamIds = getUserLeagueTeamIds(chatId);
  if (!teamIds.includes(teamId)) {
    return { removed: false, fallbackSelectedTeam: null };
  }

  try {
    await azureStorageService.deleteUserTeam(bot, chatId, teamId);
  } catch (err) {
    console.error(`Error deleting user team ${teamId} for ${chatId}:`, err);
    throw err;
  }

  if (currentTeamCache[chatId]) {
    delete currentTeamCache[chatId][teamId];
    if (Object.keys(currentTeamCache[chatId]).length === 0) {
      delete currentTeamCache[chatId];
    }
  }
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
    if (Object.keys(bestTeamsCache[chatId]).length === 0) {
      delete bestTeamsCache[chatId];
    }
  }
  if (selectedChipCache[chatId]) {
    delete selectedChipCache[chatId][teamId];
    if (Object.keys(selectedChipCache[chatId]).length === 0) {
      delete selectedChipCache[chatId];
    }
  }
  const selectedBestTeamByTeam = clearSelectedBestTeam(chatId, teamId);

  // If the removed team was the active one, promote another followed team (or
  // clear the selection entirely if none remain).
  let fallbackSelectedTeam = getSelectedTeam(chatId);
  if (fallbackSelectedTeam === teamId) {
    const remaining = getUserLeagueTeamIds(chatId);
    fallbackSelectedTeam = remaining[0] || null;

    const key = String(chatId);
    if (!userCache[key]) {
      userCache[key] = {};
    }
    if (fallbackSelectedTeam) {
      userCache[key].selectedTeam = fallbackSelectedTeam;
    } else {
      delete userCache[key].selectedTeam;
    }
  }

  try {
    await updateUserAttributes(chatId, {
      selectedTeam: fallbackSelectedTeam,
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        selectedBestTeamByTeam,
      ),
    });
  } catch (err) {
    console.error(
      `Error persisting user attributes after unfollow for ${chatId}:`,
      err,
    );
  }

  await sendLogMessage(
    bot,
    `User ${chatId} stopped following team ${teamId}. Active team: ${
      fallbackSelectedTeam || 'none'
    }.`,
  );

  return { removed: true, fallbackSelectedTeam };
}

module.exports = {
  handleUnfollowTeamCommand,
  removeFollowedTeam,
  buildTeamLabel,
  buildLeagueNameMap,
  extractLeagueCode,
  COMMAND_UNFOLLOW_TEAM,
};
