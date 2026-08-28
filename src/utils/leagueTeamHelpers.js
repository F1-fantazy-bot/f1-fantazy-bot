const azureStorageService = require('../azureStorageService');
const { sendLogMessage } = require('./utils');
const {
  sanitizeIdSegment,
  sanitizeTeamName,
  buildLeagueTeamId,
} = require('./teamId');
const {
  currentTeamCache,
  leagueTeamsDataCache,
} = require('../cache');
const {
  createFollowTeamService,
  ACTION,
} = require('../services/followTeamService');
const {
  ensureSourceIsLeague,
} = require('./teamSourceSwitcher');
const { listUserLeagues } = require('../leagueRegistryService');
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
 *
 * `costCapRemaining` is derived from `leagueTeam.budget` — which is the
 * user's cost cap going into the upcoming matchday (`team_info.maxTeambal`
 * from the upstream F1 Fantasy API). See the companion scraper PR
 * f1-fantasy-api-data#19 for the field's definition.
 *
 * Transition / backwards-compat: before that scraper PR shipped, `budget`
 * on cached blobs carried `team_info.teamVal` (the team's current value,
 * i.e. the sum of driver + constructor prices). Reading those stale
 * blobs through this mapper trivially yields `costCapRemaining =
 * teamVal − Σ_prices ≈ 0` — the same value the bot reported in
 * production before the cap-cap fix landed. No regression during the
 * deployment window; the moment the next scrape repopulates a blob the
 * mapper starts emitting correct values for that team.
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
  const boostDriverId =
    captain?.id === undefined || captain?.id === null
      ? null
      : String(captain.id);
  const driverIds = drivers.map((driver) =>
    driver?.id === undefined || driver?.id === null
      ? null
      : String(driver.id),
  );
  const constructorIds = constructors.map((constructor) =>
    constructor?.id === undefined || constructor?.id === null
      ? null
      : String(constructor.id),
  );

  const teamValue = sumPrices(drivers) + sumPrices(constructors);
  const cap = Number(leagueTeam.budget);
  const costCapRemaining = Number.isFinite(cap)
    ? Math.max(0, Math.round((cap - teamValue) * 100) / 100)
    : 0;

  const transfersRemainingRaw = Number(leagueTeam.transfersRemaining);
  const freeTransfers = Number.isFinite(transfersRemainingRaw)
    ? Math.max(0, transfersRemainingRaw)
    : 0;

  return {
    drivers: drivers.map((d) => mapNameToCode(d.name)),
    ...(driverIds.every(Boolean) ? { driverIds } : {}),
    constructors: constructors.map((c) => mapNameToCode(c.name)),
    ...(constructorIds.every(Boolean) ? { constructorIds } : {}),
    boost,
    ...(boostDriverId ? { boostDriverId } : {}),
    freeTransfers,
    costCapRemaining,
    // Display + identity metadata. Optional fields the consumers can use to
    // render friendly labels without re-loading the league blob. Older
    // cached teams may not have these populated until the next refresh.
    ...(leagueTeam.teamName ? { teamName: leagueTeam.teamName } : {}),
    ...(leagueTeam.userName ? { userName: leagueTeam.userName } : {}),
    ...(leagueTeam.teamNo !== undefined && leagueTeam.teamNo !== null
      ? { teamNo: leagueTeam.teamNo }
      : {}),
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

function createTelegramFollowTeamService(bot) {
  const storage = {
    listUserTeams: (chatId) =>
      azureStorageService.listUserTeamData(chatId),
    saveUserTeam: (chatId, teamId, teamData) =>
      azureStorageService.saveUserTeam(bot, chatId, teamId, teamData),
    deleteUserTeam: (chatId, teamId) =>
      azureStorageService.deleteUserTeam(bot, chatId, teamId),
    deleteAllUserTeams: (chatId) =>
      azureStorageService.deleteAllUserTeams(bot, chatId),
  };

  return createFollowTeamService({
    storage,
    logger: (message) => sendLogMessage(bot, message),
    sourceSwitcher: (chatId) => ensureSourceIsLeague(bot, chatId),
    listUserLeagues,
    loadLeagueTeamsData: refreshLeagueTeamsData,
    mapLeagueTeamToBotTeam,
  });
}

async function followLeagueTeam(bot, chatId, selection) {
  const result = await createTelegramFollowTeamService(bot).mutate({
    chatId,
    action: ACTION.ADD,
    leagueCode: selection.leagueCode,
    teamId: selection.teamId,
  });
  if (result.status !== 'ok') {
    const error = new Error(result.summary);
    error.code = result.status;
    throw error;
  }

  return {
    teamId: result.teamId,
    teamLabel: result.teamName,
  };
}

async function removeFollowedTeam(
  bot,
  chatId,
  teamId,
  options = {},
) {
  const result = await createTelegramFollowTeamService(bot).mutate({
    chatId,
    action: ACTION.REMOVE,
    teamId,
    mutateSelectedTeam: options.mutateSelectedTeam,
  });

  return result.status === 'ok'
    ? {
      removed: result.changed,
      fallbackSelectedTeam: result.fallbackSelectedTeam || null,
    }
    : { removed: false, fallbackSelectedTeam: null };
}

function buildLeagueNameMap(leagues) {
  const map = {};
  for (const league of leagues || []) {
    map[league.leagueCode] = league.leagueName || league.leagueCode;
  }

  return map;
}

/**
 * Display label for a followed team. Prefers cached `teamName` when present
 * (populated by `mapLeagueTeamToBotTeam` for any team refreshed since the
 * cross-league refactor). Falls back to the teamId itself. No longer
 * appends a league suffix — fantasy ids are league-agnostic, so a single
 * team may belong to multiple leagues.
 */
function buildTeamLabel(chatId, teamId) {
  const teamData = currentTeamCache[chatId]?.[teamId];

  return teamData?.teamName || teamId;
}

module.exports = {
  mapNameToCode,
  mapLeagueTeamToBotTeam,
  loadLeagueTeamsData,
  refreshLeagueTeamsData,
  followLeagueTeam,
  removeFollowedTeam,
  buildLeagueNameMap,
  buildTeamLabel,
  sanitizeIdSegment,
  sanitizeTeamName,
  buildLeagueTeamId,
};
