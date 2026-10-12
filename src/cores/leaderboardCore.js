// Pure leaderboard core — fetches a league's standings blob and returns
// a structured response with the user's selected team highlighted via
// `selectedTeamId` so renderers can apply their own bolding/styling.
// Both the Telegram adapter (`commandsHandler/leaderboardHandler.js`)
// and the agent's `get_leaderboard` tool call into this.
//
// Returns a status-tagged result the caller can map onto its preferred
// surface (Telegram HTML message vs. structured JSON for the LLM).

const { getSelectedTeam } = require('../cache');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { buildLeagueTeamId, sameLeagueTeamIds } = require('../utils/teamId');

const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { buildRoundToRaceNameMap } = require('./leagueGraphsCore');
const { countryFlag } = require('../utils/countryFlag');

// Nullable tool fields represent unspecified choices without placeholder
// values. Internal callers keep the ordinary omitted form.
function normalizeLeaderboardArgs(args) {
  const result = { ...args };
  for (const key of ['period', 'matchdayId', 'raceName', 'leagueCode']) {
    if (result[key] === null || result[key] === '') {
      delete result[key];
    }
  }

  return result;
}

function finiteScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function discoverLeaderboardRaces(teams, roundToRaceName = {}, roundToCountry = {}) {
  const rounds = new Set();
  for (const team of Array.isArray(teams) ? teams : []) {
    for (const [key, score] of Object.entries(team.raceScores || {})) {
      const match = /^matchday_([1-9]\d*)$/.exec(key);
      if (match && Number.isSafeInteger(Number(match[1])) && finiteScore(score) !== null) {
        rounds.add(Number(match[1]));
      }
    }
  }

  return [...rounds].sort((a, b) => b - a).map((matchdayId) => ({
    matchdayId,
    raceName: roundToRaceName[matchdayId] || `R${matchdayId}`,
    ...(roundToCountry[matchdayId] ? { country: roundToCountry[matchdayId], raceFlag: countryFlag(roundToCountry[matchdayId]) } : {}),
  }));
}

function normalizedRaceName(name) {
  return name.toLowerCase().replace(/grand prix|\bgp\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function resolveLeaderboardRace(races, { matchdayId, raceName }) {
  if (matchdayId !== undefined) {
    return races.filter((race) => race.matchdayId === matchdayId);
  }
  const name = normalizedRaceName(raceName || '');
  if (!name) {
    return [];
  }
  const exact = races.filter((race) => normalizedRaceName(race.raceName) === name);

  return exact.length ? exact : races.filter((race) => normalizedRaceName(race.raceName).includes(name));
}

function buildLeaderboardStandings(inputTeams, { selectedTeamId = null, matchdayId } = {}) {
  const teams = [...inputTeams];
  teams.sort((a, b) => (a.position || 0) - (b.position || 0));

  if (matchdayId !== undefined) {
    teams.sort((a, b) => {
      const left = finiteScore(a.raceScores?.[`matchday_${matchdayId}`]);
      const right = finiteScore(b.raceScores?.[`matchday_${matchdayId}`]);
      if (left === null) {
        return right === null ? 0 : 1;
      }
      if (right === null) {
        return -1;
      }

      return right - left;
    });
  }
  const scoreOf = (team) => finiteScore(
    matchdayId !== undefined
      ? team.raceScores?.[`matchday_${matchdayId}`]
      : team.totalScore,
  );
  const leaderScore = teams.length > 0 ? scoreOf(teams[0]) : null;
  let rank = null;
  let lastScore = null;

  return teams.map((team, index) => {
    const totalScore = scoreOf(team);
    if (totalScore !== null && (lastScore === null || totalScore !== lastScore)) {
      rank = index + 1;
    }
    lastScore = totalScore;
    const position = matchdayId !== undefined
      ? totalScore === null ? null : rank
      : finiteScore(team.position);
    const teamId = buildLeagueTeamId(team.userName, team.teamNo, team.accountId) || null;
    const gapToLeader =
      totalScore !== null && leaderScore !== null
        ? totalScore - leaderScore
        : null;

    return {
      position,
      teamName: team.teamName || team.userName || '—',
      userName: team.userName || null,
      teamNo:
        typeof team.teamNo === 'number' && Number.isFinite(team.teamNo)
          ? team.teamNo
          : null,
      teamId,
      totalScore,
      gapToLeader,
      isSelected: Boolean(teamId && selectedTeamId && sameLeagueTeamIds(teamId, selectedTeamId)),
    };
  });
}

// Existing callers default to season totals. Web chat opts into period selection.
async function getLeaderboard({
  chatId, leagueCode, period, matchdayId, raceName, requirePeriod = false,
}) {
  if (!leagueCode || typeof leagueCode !== 'string') {
    return { status: 'invalid_input', leagueCode: leagueCode || null };
  }

  const userLeagues = await listUserLeagues(chatId);
  const follows = (userLeagues || []).some(
    (league) => league.leagueCode === leagueCode,
  );

  if (!follows) {
    return { status: 'not_followed', leagueCode };
  }

  const leagueData = await getLeagueData(leagueCode);
  if (!leagueData) {
    return { status: 'not_found', leagueCode };
  }

  if (
    (period && !['season', 'race'].includes(period)) ||
      (matchdayId !== undefined && (!Number.isSafeInteger(matchdayId) || matchdayId < 1)) ||
      (raceName !== undefined && typeof raceName !== 'string') ||
    (period === 'season' && (matchdayId !== undefined || raceName))
  ) {
    return { status: 'invalid_input', leagueCode };
  }
  const selectedPeriod = period || (
    matchdayId !== undefined || raceName ? 'race' : requirePeriod ? null : 'season'
  );
  const teams = Array.isArray(leagueData.teams) ? [...leagueData.teams] : [];
  let selectedRace;
  if (selectedPeriod !== 'season') {
    let names = {};
    const countries = {};
    try {
      const seasonData = await fetchCurrentSeasonRaces();
      names = buildRoundToRaceNameMap(seasonData);
      for (const race of seasonData?.MRData?.RaceTable?.Races || []) {
        const country = race?.Circuit?.Location?.country;
        if (typeof country === 'string' && country.trim()) {
          countries[Number(race.round)] = country;
        }
      }
    } catch {
      // Schedule enrichment is optional; recorded rounds remain selectable.
    }
    const races = discoverLeaderboardRaces(teams, names, countries);
    if (!selectedPeriod || (matchdayId === undefined && !raceName)) {
      return { status: 'select_period', leagueCode, races, raceOnly: selectedPeriod === 'race' };
    }
    const matches = resolveLeaderboardRace(races, { matchdayId, raceName });
    if (matches.length > 1) {
      return { status: 'ambiguous_race', leagueCode, races: matches, raceOnly: true };
    }
    selectedRace = matches[0];
    if (!selectedRace) {
      return {
        status: 'race_unavailable', leagueCode, period: 'race',
        matchdayId: matchdayId ?? null,
        ...(countries[matchdayId] ? { raceFlag: countryFlag(countries[matchdayId]) } : {}),
        raceName: raceName || names[matchdayId] || (matchdayId ? `R${matchdayId}` : null),
      };
    }
  }
  const selectedTeamId = getSelectedTeam(chatId) || null;
  const standings = buildLeaderboardStandings(teams, {
    selectedTeamId, matchdayId: selectedRace?.matchdayId,
  });

  return {
    status: 'ok',
    period: selectedPeriod,
    ...(selectedRace || {}),
    leagueCode,
    leagueName: leagueData.leagueName || leagueCode,
    ...(typeof leagueData.leagueId === 'number'
      ? { leagueId: leagueData.leagueId }
      : {}),
    memberCount:
      typeof leagueData.memberCount === 'number'
        ? leagueData.memberCount
        : teams.length,
    fetchedAt: leagueData.fetchedAt || null,
    selectedTeamId,
    standings,
  };
}

module.exports = {
  getLeaderboard, discoverLeaderboardRaces, resolveLeaderboardRace, buildLeaderboardStandings, normalizeLeaderboardArgs,
};
