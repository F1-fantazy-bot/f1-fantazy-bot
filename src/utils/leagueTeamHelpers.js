const azureStorageService = require('../azureStorageService');
const { updateUserAttributes } = require('../userRegistryService');
const { sendLogMessage } = require('./utils');
const { sanitizeTeamName, buildTeamId } = require('./teamId');
const {
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
  leagueTeamsDataCache,
  clearSelectedBestTeam,
  serializeSelectedBestTeamByTeam,
  getUserLeagueTeamIds,
  getSelectedTeam,
} = require('../cache');
const { NAME_TO_CODE_MAPPING } = require('../constants');

function mapNameToCode(name) {
  if (name === null || name === undefined) {
    return name;
  }

  const key = String(name).toLowerCase().trim();

  return NAME_TO_CODE_MAPPING[key] || name;
}

/**
 * Map one league team entry (from teams-data.json) to the bot's team cache shape.
 */
function mapLeagueTeamToBotTeam(leagueTeam) {
  const drivers = Array.isArray(leagueTeam.drivers) ? leagueTeam.drivers : [];
  const constructors = Array.isArray(leagueTeam.constructors)
    ? leagueTeam.constructors
    : [];

  const sumPrices = (items) =>
    items.reduce((acc, item) => acc + (Number(item.price) || 0), 0);

  const captain =
    drivers.find((d) => d.isCaptain) ||
    drivers.find((d) => d.isMegaCaptain) ||
    drivers[0];
  const boost = captain ? mapNameToCode(captain.name) : null;

  const budget = Number(leagueTeam.budget);
  const costCapRemaining = Number.isFinite(budget)
    ? Math.round((budget - sumPrices(drivers) - sumPrices(constructors)) * 100) /
      100
    : 0;

  const transfersRemainingRaw = Number(leagueTeam.transfersRemaining);
  const freeTransfers = Number.isFinite(transfersRemainingRaw)
    ? Math.max(0, transfersRemainingRaw)
    : 0;

  return {
    drivers: drivers.map((d) => mapNameToCode(d.name)),
    constructors: constructors.map((c) => mapNameToCode(c.name)),
    boost,
    freeTransfers,
    costCapRemaining,
  };
}

/**
 * Fetch and cache per-league teams-data.json.
 */
async function loadLeagueTeamsData(leagueCode) {
  if (leagueTeamsDataCache[leagueCode]) {
    return leagueTeamsDataCache[leagueCode];
  }

  const data = await azureStorageService.getLeagueTeamsData(leagueCode);
  if (data) {
    leagueTeamsDataCache[leagueCode] = data;
  }

  return data;
}

/**
 * Refresh the in-memory league roster by re-reading the blob. Call before
 * saving to minimize the chance of saving a stale position.
 */
async function refreshLeagueTeamsData(leagueCode) {
  delete leagueTeamsDataCache[leagueCode];

  return loadLeagueTeamsData(leagueCode);
}

/**
 * Persist & cache a single league team as a followed team, without touching
 * selectedTeam. The caller is responsible for active-team resolution.
 *
 * @returns {Promise<{teamId: string, teamLabel: string}>}
 */
async function followLeagueTeam(bot, chatId, { teamId, leagueTeam }) {
  const teamData = mapLeagueTeamToBotTeam(leagueTeam);

  if (!currentTeamCache[chatId]) {
    currentTeamCache[chatId] = {};
  }
  currentTeamCache[chatId][teamId] = teamData;

  try {
    await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);
  } catch (err) {
    delete currentTeamCache[chatId][teamId];
    throw err;
  }

  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }
  if (selectedChipCache[chatId]) {
    delete selectedChipCache[chatId][teamId];
  }
  clearSelectedBestTeam(chatId, teamId);

  return {
    teamId,
    teamLabel: leagueTeam.teamName || leagueTeam.userName || teamId,
  };
}

/**
 * Remove a followed league team from cache + blob storage. When
 * `mutateSelectedTeam` is false, the caller is responsible for resolving and
 * persisting the new active team (used by the Teams Tracker save flow which
 * owns end-to-end active-team selection).
 *
 * @returns {Promise<{removed: boolean, fallbackSelectedTeam: string|null}>}
 */
async function removeFollowedTeam(
  bot,
  chatId,
  teamId,
  { mutateSelectedTeam = true } = {},
) {
  const teamIds = getUserLeagueTeamIds(chatId);
  if (!teamIds.includes(teamId)) {
    return { removed: false, fallbackSelectedTeam: null };
  }

  await azureStorageService.deleteUserTeam(bot, chatId, teamId);

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

  let fallbackSelectedTeam = getSelectedTeam(chatId);
  if (!mutateSelectedTeam) {
    return { removed: true, fallbackSelectedTeam };
  }

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

function extractLeagueCode(teamId) {
  const separatorIdx = teamId.indexOf('_');

  return separatorIdx === -1 ? null : teamId.substring(0, separatorIdx);
}

function buildLeagueNameMap(leagues) {
  const map = {};
  for (const league of leagues || []) {
    map[league.leagueCode] = league.leagueName || league.leagueCode;
  }

  return map;
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

module.exports = {
  mapNameToCode,
  mapLeagueTeamToBotTeam,
  loadLeagueTeamsData,
  refreshLeagueTeamsData,
  followLeagueTeam,
  removeFollowedTeam,
  extractLeagueCode,
  buildLeagueNameMap,
  buildTeamLabel,
  sanitizeTeamName,
  buildTeamId,
};
