// Read-only weekly inputs shared by Telegram and the agent. Refreshes never
// add teams, change selection/preferences, or rewrite user-team blobs.
const cache = require('../cache');
const storage = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { identityKeyFromLeagueTeamId, buildLeagueTeamIdentityKey, buildLegacyLeagueTeamId } = require('../utils/teamId');
const { applyPrices } = require('../priceData');
const pending = new Map();
const refreshedAt = new Map();
const REFRESH_INTERVAL_MS = 30000;

async function loadWeeklySources(chatId, leagueCodes) {
  const leagues = leagueCodes ? leagueCodes.map((leagueCode) => ({ leagueCode })) : await listUserLeagues(chatId);

  return Promise.all((leagues || []).map(async ({ leagueCode }) => ({
    leagueCode, data: await storage.getLeagueTeamsData(leagueCode),
  })));
}

function resolveWeeklyTeam(teamId, savedTeam, sources) {
  const identity = buildLeagueTeamIdentityKey(savedTeam?.accountId, savedTeam?.teamNo) || identityKeyFromLeagueTeamId(teamId);
  for (const { leagueCode, data } of sources) {
    const matches = (data?.teams || []).filter((team) => identity
      ? buildLeagueTeamIdentityKey(team.accountId, team.teamNo) === identity
      : buildLegacyLeagueTeamId(team.userName, team.teamNo) === teamId);
    if (matches.length === 1) {
      // Lazy import avoids the follow-team service's cache dependency cycle.
      const { mapLeagueTeamToBotTeam } = require('../utils/leagueTeamHelpers');

      return mapLeagueTeamToBotTeam(matches[0], { matchdayId: data.matchdayId, leagueCode });
    }
  }

  return { ...savedTeam, teamStateStatus: 'unavailable', budgetStatus: 'unknown',
    transfersStatus: 'unknown', costCapRemaining: null, freeTransfers: null };
}

async function refreshWeeklyTeamData(chatId, { force = false } = {}) {
  const key = String(chatId);
  const leagueIds = Object.keys(cache.currentTeamCache[key] || {}).filter((id) => id.includes('_'));
  if (!leagueIds.length || (!force && Date.now() - (refreshedAt.get(key) || 0) < REFRESH_INTERVAL_MS)) {return;}
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      try {
        const [sources, prices] = await Promise.all([loadWeeklySources(key), storage.getPricesData()]);
        if (!prices || !Number.isInteger(prices.matchdayId) || !prices.drivers?.length || !prices.constructors?.length) {throw new Error('Weekly prices unavailable');}
        const priced = applyPrices({ drivers: {}, constructors: {} }, prices);
        if (priced.report.drivers.invalid.length || priced.report.constructors.invalid.length) {throw new Error('Weekly prices invalid');}
        const nextTeams = new Map(leagueIds.map((id) => [id, resolveWeeklyTeam(id, cache.currentTeamCache[key]?.[id], sources)]));
        if (JSON.stringify([cache.pricesCache.drivers, cache.pricesCache.constructors, cache.pricesCache.metadata?.matchdayId]) !==
          JSON.stringify([priced.priceMaps.drivers, priced.priceMaps.constructors, prices.matchdayId])) {
          // Canonical prices are shared: cached recommendations for every user
          // depend on the same prices, including users not refreshed this turn.
          for (const id of Object.keys(cache.bestTeamsCache)) {delete cache.bestTeamsCache[id];}
        }
        cache.setPrices({ ...priced.priceMaps, driverEntries: prices.drivers,
          constructorEntries: prices.constructors, metadata: { matchdayId: prices.matchdayId, fetchedAt: prices.fetchedAt } });
        for (const { leagueCode, data } of sources) {cache.leagueTeamsDataCache[leagueCode] = data;}
        for (const [id, team] of nextTeams) {
          // Do not recreate a team removed while the reads were in flight.
          if (!cache.currentTeamCache[key]?.[id]) {continue;}
          if (JSON.stringify(cache.currentTeamCache[key][id]) !== JSON.stringify(team)) {
            if (cache.bestTeamsCache[key]) {delete cache.bestTeamsCache[key][id];}
          }
          cache.currentTeamCache[key][id] = team;
        }
        refreshedAt.set(key, Date.now());
      } catch (error) {
        console.error('Weekly team refresh failed:', error.message);
        for (const id of leagueIds) {
          const team = cache.currentTeamCache[key]?.[id];
          if (team) {cache.currentTeamCache[key][id] = resolveWeeklyTeam(id, team, []);}
          if (cache.bestTeamsCache[key]) {delete cache.bestTeamsCache[key][id];}
        }
      }
    })().finally(() => pending.delete(key)));
  }
  await pending.get(key);
}

function resetWeeklyRefreshForTests() { pending.clear(); refreshedAt.clear(); }

module.exports = { loadWeeklySources, resolveWeeklyTeam, refreshWeeklyTeamData, resetWeeklyRefreshForTests };
