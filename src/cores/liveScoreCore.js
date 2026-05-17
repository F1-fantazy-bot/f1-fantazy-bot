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
} = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { getSelectedTeam } = require('../cache');
const {
  sanitizeTeamName,
  buildLeagueTeamId,
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

function pickLockedTeam({ snapshot, teamId, teamName }) {
  const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
  if (teams.length === 0) {
    return { status: 'team_not_found' };
  }

  // Try teamId match first.
  if (teamId) {
    const match = teams.find(
      (t) => buildLeagueTeamId(t.userName, t.teamNo) === teamId,
    );
    if (match) {
      return { status: 'ok', team: match };
    }
    // Fall through to teamName matching if available — buildLeagueTeamId
    // formatting may differ from how selectedTeam was generated when the
    // user's account name has non-ASCII or unusual characters.
  }

  if (teamName) {
    const exact = teams.find(
      (t) => (t.teamName || t.userName) === teamName,
    );
    if (exact) {
      return { status: 'ok', team: exact };
    }
    const slug = sanitizeTeamName(teamName);
    const sanitizedMatch = teams.find(
      (t) =>
        sanitizeTeamName(t.teamName || t.userName || 'team') === slug,
    );
    if (sanitizedMatch) {
      return { status: 'ok', team: sanitizedMatch };
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

  // No auto-default to selectedTeam — the LLM must ASK which team via the
  // clarify-and-focus pattern. When no team args are supplied, return
  // team_not_found with availableTeams so the LLM can surface options.
  const pick = pickLockedTeam({
    snapshot,
    teamId,
    teamName,
  });
  if (pick.status !== 'ok' || !pick.team) {
    return {
      status: 'team_not_found',
      leagueCode: resolvedLeagueCode,
      leagueName: followed.leagueName,
      teamId,
      teamName,
      reason: pick.team ? undefined : 'no_team_specified',
      availableTeams: snapshot.teams.map((t) => ({
        teamName: t.teamName,
        userName: t.userName,
        teamNo: t.teamNo,
        position: t.position,
        teamId: buildLeagueTeamId(t.userName, t.teamNo),
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
    teamId: buildLeagueTeamId(match.userName, match.teamNo),
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

  const rows = snapshot.teams.map((team) => {
    const realTeam = mapLockedTeamForScoring(team);
    const options = deriveLiveScoreOptions(team);
    const { totalPoints, totalPriceChange, transferPenalty } =
      calculateLiveScoreBreakdown(realTeam, liveScoreData, options);
    const teamId = buildLeagueTeamId(team.userName, team.teamNo);

    return {
      teamId,
      teamName: team.teamName || team.userName || null,
      userName: team.userName || null,
      teamNo: team.teamNo ?? null,
      position: team.position ?? null,
      totalPoints,
      totalPriceChange,
      transferPenalty,
      isSelected: !!teamId && teamId === selectedTeamId,
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
  const teams = [...snapshot.teams]
    .sort((a, b) => (a.position || Infinity) - (b.position || Infinity))
    .map((t) => {
      const teamId = buildLeagueTeamId(t.userName, t.teamNo);

      return {
        teamId,
        teamName: t.teamName || t.userName || null,
        userName: t.userName || null,
        teamNo: t.teamNo ?? null,
        position: t.position ?? null,
        isSelected: !!teamId && teamId === selectedTeamId,
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
