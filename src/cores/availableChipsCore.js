// Read-only shared core. Membership always comes from standings; chip records
// join only on account identity + team number. No preferences/cache mutations.
const { buildLeagueTeamId, buildLeagueTeamIdentityKey, identityKeyFromLeagueTeamId } = require('../utils/teamId');

const CHIP_CATALOG = Object.freeze(['Wildcard', 'Limitless', 'Final Fix', 'Extra DRS Boost', 'No Negative', 'Autopilot']);
const aliases = new Map(CHIP_CATALOG.map((name) => [name.toLowerCase().replace(/[^a-z]/g, ''), name]));
aliases.set('autopilot', 'Autopilot');
aliases.set('extraboost', 'Extra DRS Boost');
aliases.set('extradrs', 'Extra DRS Boost');
function normalizeChip(name) {
  return typeof name === 'string' ? aliases.get(name.toLowerCase().replace(/[^a-z]/g, '')) || null : null;
}
function identity(team) {
  return buildLeagueTeamIdentityKey(team?.accountId, team?.teamNo);
}
function chipRecord(team, source, now) {
  const time = typeof source?.fetchedAt === 'string' ? Date.parse(source.fetchedAt) : NaN;
  const updatedAt = Number.isFinite(time) ? new Date(time).toISOString() : null;
  const validSeason = updatedAt && new Date(time).getUTCFullYear() === now.getUTCFullYear();
  let used = null;
  if (team?.chipUsageStatus === 'known' && Array.isArray(team.chipsUsed) && validSeason) {
    const names = Array.from(team.chipsUsed, (chip) => normalizeChip(chip?.name));
    if (names.every(Boolean)) {used = CHIP_CATALOG.filter((name) => names.includes(name));}
  }

  return { time: Number.isFinite(time) ? time : Infinity, updatedAt, used };
}
function remainingChips(records) {
  if (!records.length) {return { chipUsageStatus: 'unknown', availableChips: null, updatedAt: null };}
  const newest = Math.max(...records.map((record) => record.time));
  const latest = records.filter((record) => record.time === newest);
  const first = latest[0];
  const known = first.used !== null && latest.every((record) => record.used !== null && JSON.stringify(record.used) === JSON.stringify(first.used));

  return {
    chipUsageStatus: known ? 'known' : 'unknown',
    availableChips: known ? CHIP_CATALOG.filter((name) => !first.used.includes(name)) : null,
    updatedAt: first.updatedAt,
  };
}
function matchNames(items, value, name) {
  const query = value.trim().toLowerCase();
  const exact = items.filter((item) => String(name(item) || '').toLowerCase() === query);

  return exact.length ? exact : items.filter((item) => String(name(item) || '').toLowerCase().includes(query));
}
function choices(choice, options, request = {}) {
  return { status: 'selection_required', choice, options: options.map((option) => ({ action: 'get_available_chips', ...option })), request };
}
function normalizeAvailableChipsArgs(args = {}) {
  const { scope, teamId, teamName, leagueCode, leagueName } = args;

  return { ...args, scope: teamId || teamName ? 'team' : leagueCode || leagueName ? (scope || 'league') : scope };
}
function defaultPorts() {
  const storage = require('../azureStorageService');

  return {
    ...storage,
    getLockedTeamsData: (code) => storage.getLockedTeamsData(code, undefined, { latestByUpdate: true }),
    ...require('../leagueRegistryService'),
    listTrackedTeams: require('../userTeamRegistryService').listUserTeams,
  };
}
async function getAvailableChips({ chatId, now = new Date(), ports = defaultPorts(), ...input }) {
  const args = normalizeAvailableChipsArgs(input);
  if (!args.scope) {
    return choices('scope', ['team', 'tracked', 'league'].map((scope, index) => ({ label: ['One team', 'All tracked teams', 'Entire league'][index], args: { scope } })));
  }
  const leagues = (await ports.listUserLeagues(chatId)) || [];
  let selected = leagues;
  const leagueChoices = (items) => choices('league', items.map((league) => ({
    label: league.leagueName || league.leagueCode, detail: league.leagueCode,
    args: { ...args, leagueName: undefined, leagueCode: league.leagueCode },
  })), args);
  if (args.leagueCode) {
    selected = leagues.filter((league) => league.leagueCode.toLowerCase() === args.leagueCode.trim().toLowerCase());
    if (!selected.length) {return { status: 'not_followed' };}
  } else if (args.leagueName) {
    selected = matchNames(leagues, args.leagueName, (league) => league.leagueName);
    if (selected.length !== 1) {return leagueChoices(selected.length ? selected : leagues);}
  } else if (args.scope !== 'tracked' && !args.teamId && !args.teamName && leagues.length !== 1) {
    return leagues.length ? leagueChoices(leagues) : { status: 'no_followed_leagues' };
  }
  let tracked = [];
  if (args.scope === 'tracked') {
    const saved = await ports.listTrackedTeams(chatId);
    tracked = Object.entries(saved || {}).filter(([teamId, team]) => teamId.includes('_') || team?.source === 'league' || team?.leagueCode)
      .map(([teamId, team]) => ({ ...team, teamId }));
    if (!tracked.length) {return { status: 'empty', scope: 'tracked', teams: [] };}
  }
  if (!selected.length && args.scope !== 'tracked') {return { status: 'no_followed_leagues' };}
  const sources = await Promise.all(selected.map(async (league) => {
    const reads = await Promise.allSettled([ports.getLeagueData(league.leagueCode), ports.getLockedTeamsData(league.leagueCode)]);

    return { league, standings: reads[0].status === 'fulfilled' ? reads[0].value : null,
      locked: reads[1].status === 'fulfilled' ? reads[1].value : null,
      incomplete: reads.some((read) => read.status === 'rejected') || !Array.isArray(reads[0].value?.teams) };
  }));
  const members = new Map();
  for (const { league, standings } of sources) {
    for (const [index, team] of (Array.isArray(standings?.teams) ? standings.teams : []).entries()) {
      const key = identity(team) || `unresolved:${league.leagueCode}:${index}`;
      let member = members.get(key);
      if (!member) {
        member = { teamName: team.teamName || team.userName || '—', userName: team.userName || '',
          teamId: buildLeagueTeamId(team.userName, team.teamNo, team.accountId), key,
          leagueCode: league.leagueCode, teamNo: team.teamNo, leagues: [], records: [] };
        members.set(key, member);
      }
      if (!member.leagues.some((entry) => entry.leagueCode === league.leagueCode)) {
        member.leagues.push({ leagueCode: league.leagueCode, leagueName: league.leagueName || league.leagueCode });
      }
    }
  }
  // Membership is authoritative; a snapshot can contribute usage only for a
  // canonical team currently present in that same league's standings.
  for (const { standings, locked } of sources) {
    const rows = Array.isArray(standings?.teams) ? standings.teams : [];
    const keys = new Set(rows.map(identity).filter(Boolean));
    for (const source of [standings, locked]) {
      for (const team of Array.isArray(source?.teams) ? source.teams : []) {
        const key = identity(team);
        if (key && keys.has(key)) {members.get(key)?.records.push(chipRecord(team, source, now));}
      }
    }
  }
  const all = [...members.values()];
  let teams = all;
  if (!all.length && args.scope === 'team') {
    return { status: sources.some((source) => source.incomplete) ? 'unavailable' : 'empty', teams: [] };
  }
  if (args.scope === 'tracked') {
    const seen = new Set();
    teams = tracked.filter((team) => {
      const key = identityKeyFromLeagueTeamId(team.teamId) || identity(team) || team.teamId;
      if (seen.has(key)) {return false;}
      seen.add(key);

      return true;
    }).map((team) => members.get(identityKeyFromLeagueTeamId(team.teamId) || identity(team)) || {
      teamId: team.teamId, teamName: team.teamName || team.teamId, leagues: [], records: [],
    });
  } else if (args.scope === 'team') {
    if (args.teamId) {
      const key = identityKeyFromLeagueTeamId(args.teamId);
      teams = all.filter((team) => key && team.key === key);
    } else if (args.teamName) {
      teams = matchNames(all, args.teamName, (team) => team.teamName);
    }
    if ((!args.teamId && !args.teamName) || teams.length !== 1) {
      const candidates = teams.length ? teams : all;

      return choices('team', candidates.filter((team) => team.teamId).map((team) => ({
        label: team.teamName, detail: `${team.userName} · ${team.teamNo} · ${team.leagues.map((league) => league.leagueName).join(', ')} · ${team.teamId}`,
        args: { scope: 'team', leagueCode: team.leagueCode, teamId: team.teamId },
      })), args);
    }
  }
  const partial = sources.some((source) => source.incomplete || !source.standings);

  return { status: teams.length ? 'ok' : partial ? 'unavailable' : 'empty', scope: args.scope,
    request: { ...args, ...(selected.length === 1 ? { leagueCode: selected[0].leagueCode, leagueName: undefined } : {}),
      ...(args.scope === 'team' && teams.length === 1 ? { teamId: teams[0].teamId, teamName: undefined } : {}) },
    partial, teams: teams.map(({ records, key: _key, ...team }) => ({ ...team, ...remainingChips(records) })) };
}
module.exports = { CHIP_CATALOG, normalizeChip, chipRecord, remainingChips, getAvailableChips, normalizeAvailableChipsArgs };
