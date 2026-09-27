// Pure live-score core — no `bot`, no `t()`, no `sendMessage`. Used by
// the web-chat agent's `get_live_score_for_team` and
// `get_live_score_leaderboard` tools. The Telegram `/live_score` flow
// is interactive (callback keyboards) and intentionally NOT routed
// through this core — the existing handler stays unchanged.
//
// Two entry points:
//   - getLiveScoreForTeam({chatId, leagueCode, teamId?, teamName?})
//     → status-tagged per-team breakdown
//   - getLiveScoreLeaderboard({chatId, leagueCode})
//     → status-tagged all-teams leaderboard
//
// Both validate `leagueCode` against the user's followed leagues
// (`listUserLeagues`) before fetching the Azure blob — mirrors
// `leaderboardCore` so the agent can't read arbitrary league data.

const {
  getLiveScoreData,
  getLockedTeamsData,
  getLeagueData,
} = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { getSelectedTeam, currentTeamCache } = require('../cache');
const { resolveLockedRoster } = require('./raceSummaryCore');
const {
  sanitizeTeamName,
  buildLeagueTeamId,
  sameLeagueTeamIds,
} = require('../utils/teamId');
const {
  mapLockedTeamForScoring,
  calculateLiveScoreBreakdown,
  deriveLiveScoreOptions,
} = require('../utils/liveScoreCalc');

// Resolve `leagueCode` OR `leagueName` against the user's followed leagues.
// Accepting either avoids forcing the LLM to chain `list_user_leagues`
// → `get_live_score_*` (which triggers the CopilotKit
// `useLazyToolRenderer` multi-step quirk and drops the second render).
async function ensureFollowed({ chatId, leagueCode, leagueName }) {
  if (
    (typeof leagueCode !== 'string' || !leagueCode.trim()) &&
    (typeof leagueName !== 'string' || !leagueName.trim())
  ) {
    return {
      status: 'invalid_input',
      reason: 'leagueCode or leagueName required',
    };
  }
  const leagues = (await listUserLeagues(chatId)) || [];
  let match = null;
  if (leagueCode) {
    match = leagues.find((l) => l.leagueCode === leagueCode);
  }
  if (!match && leagueName) {
    const normalized = leagueName.trim().toLowerCase();
    match =
      leagues.find(
        (l) => (l.leagueName || '').toLowerCase() === normalized,
      ) ||
      leagues.find((l) =>
        (l.leagueName || '').toLowerCase().includes(normalized),
      );
  }
  if (!match) {
    return { status: 'not_followed', leagueCode, leagueName };
  }

  return {
    status: 'ok',
    leagueCode: match.leagueCode,
    leagueName: match.leagueName || match.leagueCode,
  };
}

async function canonicalIdsForSnapshot(leagueCode, snapshot) {
  const teams = snapshot?.teams || [];
  const ids = new Map();
  for (const team of teams) {
    const id = buildLeagueTeamId(team.userName, team.teamNo, team.accountId);
    if (id) {ids.set(team, id);}
  }
  if (ids.size === teams.length || typeof getLeagueData !== 'function') {return ids;}

  try {
    const standings = await getLeagueData(leagueCode);
    const candidates = new Map();
    for (const team of standings?.teams || []) {
      const id = buildLeagueTeamId(team.userName, team.teamNo, team.accountId);
      if (!id) {continue;}
      const matched = resolveLockedRoster(team, teams).team;
      if (matched && !ids.has(matched)) {
        const existing = candidates.get(matched) || new Set();
        existing.add(id);
        candidates.set(matched, existing);
      }
    }
    for (const [team, matches] of candidates) {
      if (matches.size === 1) {ids.set(team, [...matches][0]);}
    }
  } catch (_err) {
    // Historical IDs are optional if standings are temporarily unavailable.
  }

  return ids;
}

function pickLockedTeam({ snapshot, teamId, teamName, chatId, canonicalIds }) {
  const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
  if (teams.length === 0) {
    return { status: 'team_not_found' };
  }

  // Try teamId match first.
  if (teamId) {
    const exact = teams.filter(
      (t) => sameLeagueTeamIds(canonicalIds.get(t), teamId),
    );
    if (exact.length === 1) {
      return { status: 'ok', team: exact[0] };
    }
    if (exact.length > 1) {return { status: 'team_not_found' };}
    const cached = currentTeamCache?.[chatId]?.[teamId];
    if (cached?.accountId) {
      const historical = resolveLockedRoster(cached, teams);
      if (historical.team) {return { status: 'ok', team: historical.team };}
    }

    if (!teamName || cached?.accountId) {
      return { status: 'team_not_found', teamId };
    }
  }

  if (teamName) {
    const exact = teams.filter(
      (t) => (t.teamName || t.userName) === teamName,
    );
    if (exact.length === 1) {
      return { status: 'ok', team: exact[0] };
    }
    const slug = sanitizeTeamName(teamName);
    const sanitizedMatches = teams.filter(
      (t) =>
        sanitizeTeamName(t.teamName || t.userName || 'team') === slug,
    );
    if (sanitizedMatches.length === 1) {
      return { status: 'ok', team: sanitizedMatches[0] };
    }
  }

  if (teamId || teamName) {
    return { status: 'team_not_found', teamId, teamName };
  }

  // No team args at all → caller will default to selectedTeam or
  // request clarification.
  return { status: 'ok', team: null };
}

async function getLiveScoreForTeam({
  chatId,
  leagueCode,
  leagueName,
  teamId,
  teamName,
} = {}) {
  const followed = await ensureFollowed({ chatId, leagueCode, leagueName });
  if (followed.status !== 'ok') {
    return followed;
  }

  const resolvedLeagueCode = followed.leagueCode;

  let snapshot;
  let liveScoreData;
  try {
    [snapshot, liveScoreData] = await Promise.all([
      getLockedTeamsData(resolvedLeagueCode),
      getLiveScoreData(),
    ]);
  } catch (err) {
    return {
      status: 'not_found',
      leagueCode: resolvedLeagueCode,
      error: err.message,
    };
  }

  if (!snapshot || !Array.isArray(snapshot.teams) || snapshot.teams.length === 0) {
    return { status: 'not_found', leagueCode: resolvedLeagueCode };
  }

  const selectedTeamId =
    !teamId && !teamName ? getSelectedTeam(chatId) : null;
  const canonicalIds = await canonicalIdsForSnapshot(resolvedLeagueCode, snapshot);
  const pick = pickLockedTeam({
    snapshot,
    teamId: teamId || selectedTeamId,
    teamName,
    chatId,
    canonicalIds,
  });
  if (pick.status !== 'ok' || !pick.team) {
    return {
      status: 'team_not_found',
      leagueCode: resolvedLeagueCode,
      leagueName: followed.leagueName,
      teamId: teamId || selectedTeamId,
      teamName,
      reason:
        !teamId && !teamName && !selectedTeamId
          ? 'no_selected_team'
          : 'team_unavailable',
      availableTeams: snapshot.teams.map((t) => ({
        teamName: t.teamName,
        userName: t.userName,
        teamNo: t.teamNo,
        position: t.position,
        teamId: canonicalIds.get(t) || null,
      })),
    };
  }

  const match = pick.team;
  const realTeam = mapLockedTeamForScoring(match);
  const options = deriveLiveScoreOptions(match);
  const breakdown = calculateLiveScoreBreakdown(realTeam, liveScoreData, options);

  return {
    status: 'ok',
    leagueCode: resolvedLeagueCode,
    leagueName: snapshot.leagueName || followed.leagueName,
    matchdayId: snapshot.matchdayId ?? null,
    extractedAt: liveScoreData?.extractedAt ?? null,
    teamId: canonicalIds.get(match) || teamId || selectedTeamId || null,
    teamName: match.teamName || match.userName || null,
    userName: match.userName || null,
    position: match.position ?? null,
    breakdown,
  };
}

async function getLiveScoreLeaderboard({
  chatId,
  leagueCode,
  leagueName,
} = {}) {
  const followed = await ensureFollowed({ chatId, leagueCode, leagueName });
  if (followed.status !== 'ok') {
    return followed;
  }

  const resolvedLeagueCode = followed.leagueCode;

  let snapshot;
  let liveScoreData;
  try {
    [snapshot, liveScoreData] = await Promise.all([
      getLockedTeamsData(resolvedLeagueCode),
      getLiveScoreData(),
    ]);
  } catch (err) {
    return {
      status: 'not_found',
      leagueCode: resolvedLeagueCode,
      error: err.message,
    };
  }

  if (!snapshot || !Array.isArray(snapshot.teams) || snapshot.teams.length === 0) {
    return { status: 'not_found', leagueCode: resolvedLeagueCode };
  }

  const selectedTeamId = getSelectedTeam(chatId);
  const canonicalIds = await canonicalIdsForSnapshot(resolvedLeagueCode, snapshot);
  const selectedLockedTeam = currentTeamCache?.[chatId]?.[selectedTeamId]
    ? resolveLockedRoster(currentTeamCache[chatId][selectedTeamId], snapshot.teams).team
    : null;

  const rows = snapshot.teams.map((team) => {
    const realTeam = mapLockedTeamForScoring(team);
    const options = deriveLiveScoreOptions(team);
    const { totalPoints, totalPriceChange, transferPenalty } =
      calculateLiveScoreBreakdown(realTeam, liveScoreData, options);
    const teamId = canonicalIds.get(team) || null;

    return {
      teamId,
      teamName: team.teamName || team.userName || null,
      userName: team.userName || null,
      teamNo: team.teamNo ?? null,
      position: team.position ?? null,
      totalPoints,
      totalPriceChange,
      transferPenalty,
      isSelected: team === selectedLockedTeam ||
        (!!teamId && sameLeagueTeamIds(teamId, selectedTeamId)),
    };
  });

  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    return b.totalPriceChange - a.totalPriceChange;
  });

  return {
    status: 'ok',
    leagueCode: resolvedLeagueCode,
    leagueName: snapshot.leagueName || followed.leagueName,
    matchdayId: snapshot.matchdayId ?? null,
    extractedAt: liveScoreData?.extractedAt ?? null,
    selectedTeamId: selectedTeamId || null,
    rows,
  };
}

async function listLeagueTeams({ chatId, leagueCode, leagueName } = {}) {
  const followed = await ensureFollowed({ chatId, leagueCode, leagueName });
  if (followed.status !== 'ok') {
    return followed;
  }

  const resolvedLeagueCode = followed.leagueCode;

  let snapshot;
  try {
    snapshot = await getLockedTeamsData(resolvedLeagueCode);
  } catch (err) {
    return {
      status: 'not_found',
      leagueCode: resolvedLeagueCode,
      error: err.message,
    };
  }

  if (!snapshot || !Array.isArray(snapshot.teams) || snapshot.teams.length === 0) {
    return { status: 'not_found', leagueCode: resolvedLeagueCode };
  }

  const selectedTeamId = getSelectedTeam(chatId);
  const canonicalIds = await canonicalIdsForSnapshot(resolvedLeagueCode, snapshot);
  const selectedLockedTeam = currentTeamCache?.[chatId]?.[selectedTeamId]
    ? resolveLockedRoster(currentTeamCache[chatId][selectedTeamId], snapshot.teams).team
    : null;
  const teams = [...snapshot.teams]
    .sort((a, b) => (a.position || Infinity) - (b.position || Infinity))
    .map((t) => {
      const teamId = canonicalIds.get(t) || null;

      return {
        teamId,
        teamName: t.teamName || t.userName || null,
        userName: t.userName || null,
        teamNo: t.teamNo ?? null,
        position: t.position ?? null,
        isSelected: t === selectedLockedTeam ||
          (!!teamId && sameLeagueTeamIds(teamId, selectedTeamId)),
      };
    });

  return {
    status: 'ok',
    leagueCode: resolvedLeagueCode,
    leagueName: snapshot.leagueName || followed.leagueName,
    matchdayId: snapshot.matchdayId ?? null,
    teams,
  };
}

module.exports = {
  getLiveScoreForTeam,
  getLiveScoreLeaderboard,
  listLeagueTeams,
};
