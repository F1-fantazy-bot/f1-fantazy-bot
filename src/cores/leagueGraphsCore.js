const { LEAGUE_GRAPH_TYPES } = require('../constants');
const { getChipEmoji } = require('../utils/chipEmojis');
const { filterExcludedGraphTeams } = require('../utils/leagueGraphFilter');
const { buildLeagueTeamId } = require('../utils/teamId');

const TEAM_COLOR_PALETTE = [
  '#e6194B',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#9A6324',
  '#808000',
  '#469990',
  '#000075',
  '#a9a9a9',
];

function sortedMatchdayKeys(teams, field) {
  const keys = new Set();
  for (const team of Array.isArray(teams) ? teams : []) {
    const values = team?.[field];
    if (!values || typeof values !== 'object') {
      continue;
    }
    for (const key of Object.keys(values)) {
      keys.add(key);
    }
  }

  return [...keys].sort((left, right) => {
    const leftNumber = Number(String(left).replace(/^matchday_/, ''));
    const rightNumber = Number(String(right).replace(/^matchday_/, ''));

    return leftNumber - rightNumber;
  });
}

function getSortedMatchdayKeys(teams) {
  return sortedMatchdayKeys(teams, 'raceScores');
}

function getSortedBudgetMatchdayKeys(teams) {
  return sortedMatchdayKeys(teams, 'raceBudgets');
}

function matchdayNumber(key) {
  const value = Number(String(key).replace(/^matchday_/, ''));

  return Number.isFinite(value) ? value : null;
}

function buildRoundToRaceNameMap(seasonData) {
  const races = seasonData?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races)) {
    return {};
  }

  const result = {};
  for (const race of races) {
    const round = Number(race?.round);
    const raceName = race?.raceName;
    if (!Number.isFinite(round) || typeof raceName !== 'string' || !raceName) {
      continue;
    }
    result[round] = raceName.replace(/\s*Grand Prix\s*$/i, ' GP').trim();
  }

  return result;
}

function buildMatchdays(keys, roundToRaceName = {}) {
  return keys.map((key) => {
    const matchdayId = matchdayNumber(key);

    return {
      key,
      matchdayId,
      label:
        matchdayId !== null && roundToRaceName[matchdayId]
          ? roundToRaceName[matchdayId]
          : matchdayId !== null
            ? `R${matchdayId}`
            : key,
    };
  });
}

function chipByMatchday(team) {
  const chips = new Map();
  for (const chip of Array.isArray(team?.chipsUsed) ? team.chipsUsed : []) {
    const matchdayId = Number(chip?.gameDayId);
    if (!Number.isFinite(matchdayId)) {
      continue;
    }
    const name = typeof chip?.name === 'string' ? chip.name : '';
    const emoji = getChipEmoji(name);
    chips.set(matchdayId, {
      name,
      emoji,
      label: name ? `${emoji} ${name}` : emoji,
    });
  }

  return chips;
}

function teamSeries({
  team,
  index,
  selectedTeamId,
  matchdays,
  values,
  includeChips,
}) {
  const teamId = buildLeagueTeamId(team?.userName, team?.teamNo);
  const chips = includeChips ? chipByMatchday(team) : new Map();

  return {
    teamId,
    teamName: team?.teamName || team?.userName || `Team ${index + 1}`,
    userName: team?.userName || null,
    teamNo: team?.teamNo ?? null,
    position:
      typeof team?.position === 'number' && Number.isFinite(team.position)
        ? team.position
        : null,
    color: TEAM_COLOR_PALETTE[index % TEAM_COLOR_PALETTE.length],
    isSelected: Boolean(teamId && teamId === selectedTeamId),
    points: matchdays.map((matchday, pointIndex) => ({
      matchdayId: matchday.matchdayId,
      label: matchday.label,
      value: values[pointIndex],
      chip: chips.get(matchday.matchdayId) || null,
    })),
  };
}

function graphBase(leagueData, graphType, matchdays, series) {
  return {
    graphType,
    leagueCode: leagueData?.leagueCode || null,
    leagueName:
      leagueData?.leagueName || leagueData?.leagueCode || 'League',
    matchdays,
    series,
  };
}

function buildGapToLeaderSeries(leagueData, options = {}) {
  const teams = filterExcludedGraphTeams(leagueData?.teams);
  teams.sort((left, right) => (left.position || 0) - (right.position || 0));
  const keys = getSortedMatchdayKeys(teams);
  const matchdays = buildMatchdays(keys, options.roundToRaceName);
  const cumulativeByTeam = teams.map((team) => {
    let running = 0;

    return keys.map((key) => {
      const raw = Number(team?.raceScores?.[key]);
      running += Number.isFinite(raw) ? raw : 0;

      return running;
    });
  });
  const leaders = keys.map((_, pointIndex) => {
    const values = cumulativeByTeam.map((series) => series[pointIndex]);

    return values.length > 0 ? Math.max(...values) : 0;
  });
  const series = teams.map((team, index) =>
    teamSeries({
      team,
      index,
      selectedTeamId: options.selectedTeamId || null,
      matchdays,
      values: cumulativeByTeam[index].map(
        (value, pointIndex) => value - leaders[pointIndex],
      ),
      includeChips: true,
    }),
  );

  return graphBase(leagueData, LEAGUE_GRAPH_TYPES.GAP, matchdays, series);
}

function computeRankPerMatchday(teams, matchdayKeys) {
  const safeTeams = Array.isArray(teams) ? teams : [];
  const cumulative = safeTeams.map(() => 0);
  const ranksPerTeam = safeTeams.map(() => []);

  for (let matchdayIndex = 0; matchdayIndex < matchdayKeys.length; matchdayIndex++) {
    const key = matchdayKeys[matchdayIndex];
    for (let teamIndex = 0; teamIndex < safeTeams.length; teamIndex++) {
      const raw = Number(safeTeams[teamIndex]?.raceScores?.[key]);
      cumulative[teamIndex] += Number.isFinite(raw) ? raw : 0;
    }

    const indices = safeTeams.map((_, index) => index);
    indices.sort((left, right) => cumulative[right] - cumulative[left]);
    let currentRank = 0;
    let lastScore = null;
    let seen = 0;
    for (const index of indices) {
      seen += 1;
      if (lastScore === null || cumulative[index] !== lastScore) {
        currentRank = seen;
        lastScore = cumulative[index];
      }
      ranksPerTeam[index][matchdayIndex] = currentRank;
    }
  }

  return ranksPerTeam;
}

function buildStandingsSeries(leagueData, options = {}) {
  const teams = filterExcludedGraphTeams(leagueData?.teams);
  const keys = getSortedMatchdayKeys(teams);
  const matchdays = buildMatchdays(keys, options.roundToRaceName);
  const ranksPerTeam = computeRankPerMatchday(teams, keys);
  const indexed = teams.map((team, index) => ({ team, index }));
  indexed.sort((left, right) => {
    const leftRanks = ranksPerTeam[left.index];
    const rightRanks = ranksPerTeam[right.index];
    const leftRank = leftRanks.length ? leftRanks[leftRanks.length - 1] : null;
    const rightRank = rightRanks.length
      ? rightRanks[rightRanks.length - 1]
      : null;
    if (leftRank === null && rightRank === null) {
      return (left.team.position || 0) - (right.team.position || 0);
    }
    if (leftRank === null) {
      return 1;
    }
    if (rightRank === null) {
      return -1;
    }
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (left.team.position || 0) - (right.team.position || 0);
  });
  const series = indexed.map(({ team, index: originalIndex }, index) =>
    teamSeries({
      team,
      index,
      selectedTeamId: options.selectedTeamId || null,
      matchdays,
      values: ranksPerTeam[originalIndex],
      includeChips: true,
    }),
  );

  return {
    ...graphBase(
      leagueData,
      LEAGUE_GRAPH_TYPES.STANDINGS,
      matchdays,
      series,
    ),
    maxRank: Math.max(1, teams.length),
  };
}

function latestBudget(team, keys) {
  for (let index = keys.length - 1; index >= 0; index--) {
    const raw = Number(team?.raceBudgets?.[keys[index]]);
    if (Number.isFinite(raw)) {
      return raw;
    }
  }

  return null;
}

function buildBudgetSeries(leagueData, options = {}) {
  const teams = filterExcludedGraphTeams(leagueData?.teams);
  const keys = getSortedBudgetMatchdayKeys(teams);
  const matchdays = buildMatchdays(keys, options.roundToRaceName);
  const latestBudgetByTeam = new Map(
    teams.map((team) => [team, latestBudget(team, keys)]),
  );
  teams.sort((left, right) => {
    const leftBudget = latestBudgetByTeam.get(left);
    const rightBudget = latestBudgetByTeam.get(right);
    if (leftBudget === null && rightBudget === null) {
      return (left.position || 0) - (right.position || 0);
    }
    if (leftBudget === null) {
      return 1;
    }
    if (rightBudget === null) {
      return -1;
    }
    if (rightBudget !== leftBudget) {
      return rightBudget - leftBudget;
    }

    return (left.position || 0) - (right.position || 0);
  });
  const series = teams.map((team, index) =>
    teamSeries({
      team,
      index,
      selectedTeamId: options.selectedTeamId || null,
      matchdays,
      values: keys.map((key) => {
        const raw = Number(team?.raceBudgets?.[key]);

        return Number.isFinite(raw) ? raw : null;
      }),
      includeChips: false,
    }),
  );

  return graphBase(
    leagueData,
    LEAGUE_GRAPH_TYPES.BUDGET,
    matchdays,
    series,
  );
}

function buildLeagueGraphSeries(leagueData, options = {}) {
  if (options.graphType === LEAGUE_GRAPH_TYPES.STANDINGS) {
    return buildStandingsSeries(leagueData, options);
  }
  if (options.graphType === LEAGUE_GRAPH_TYPES.BUDGET) {
    return buildBudgetSeries(leagueData, options);
  }

  return buildGapToLeaderSeries(leagueData, options);
}

module.exports = {
  TEAM_COLOR_PALETTE,
  buildBudgetSeries,
  buildGapToLeaderSeries,
  buildLeagueGraphSeries,
  buildRoundToRaceNameMap,
  buildStandingsSeries,
  computeRankPerMatchday,
  getSortedBudgetMatchdayKeys,
  getSortedMatchdayKeys,
  matchdayNumber,
};
