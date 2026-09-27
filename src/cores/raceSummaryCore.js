// Pure race-summary source-data construction shared by Telegram and the web
// agent. This module owns facts only; model calls, localization, telemetry,
// storage, and presentation remain in their adapters/services.
const { filterExcludedGraphTeams } = require('../utils/leagueGraphFilter');
const { buildLeagueTeamId } = require('../utils/teamId');
const { deriveLiveScoreOptions } = require('../utils/liveScoreCalc');

function findRaceName(seasonData, raceNumber) {
  const races = seasonData?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races)) {
    return null;
  }

  return (
    races.find((race) => Number(race?.round) === Number(raceNumber))
      ?.raceName || null
  );
}

function legacyRosterKey(team) {
  // Legacy snapshots did not carry accountId. Include teamName in the
  // fallback so two unrelated accounts that share userName + teamNo do not
  // overwrite each other in the roster map.
  return [
    'legacy',
    team?.userName || '',
    team?.teamNo || 1,
    team?.teamName || '',
  ].join(':');
}

function rosterKeys(team) {
  const keys = [];
  if (team?.accountId) {
    const teamId = buildLeagueTeamId(
      team?.userName,
      team?.teamNo,
      team?.accountId,
    );
    if (teamId) {
      keys.push(`account:${teamId}`);
    }
  }

  // Always index the legacy name-aware alias as well. This makes rollout
  // order safe when standings have accountId but the latest locked snapshot
  // was produced before account IDs shipped (or vice versa).
  keys.push(legacyRosterKey(team));

  return keys;
}

function memberName(member) {
  return typeof member === 'string' ? member : member?.name;
}

function rosterNames(team, field) {
  return (Array.isArray(team?.[field]) ? team[field] : [])
    .map(memberName)
    .filter(Boolean);
}

function flaggedDriverName(team, flag) {
  const driver = (Array.isArray(team?.drivers) ? team.drivers : [])
    .find((candidate) => candidate?.[flag]);

  return memberName(driver) || null;
}

function sameMembers(first, second, field) {
  const a = [...rosterNames(first, field)].sort();
  const b = [...rosterNames(second, field)].sort();

  return (
    a.length === b.length &&
    a.every((name, index) => name === b[index])
  );
}

function buildTeamDifference(subject, comparison, label) {
  const uniqueMembers = (field, first, second) => {
    const secondNames = new Set(rosterNames(second, field));

    return rosterNames(first, field).filter((name) => !secondNames.has(name));
  };
  const membersMatch =
    sameMembers(subject, comparison, 'drivers') &&
    sameMembers(subject, comparison, 'constructors');
  const scoringSetupMatch =
    membersMatch &&
    subject.boostDriver === comparison.boostDriver &&
    subject.extraBoostDriver === comparison.extraBoostDriver &&
    subject.transferPenalty === comparison.transferPenalty &&
    subject.noNegativeActive === comparison.noNegativeActive;

  return {
    label,
    sameMembers: membersMatch,
    sameScoringSetup: scoringSetupMatch,
    subject: {
      teamName: subject.teamName,
      racePlace: subject.racePlace,
      raceScore: subject.latestRaceScore,
      uniqueDrivers: uniqueMembers('drivers', subject, comparison),
      uniqueConstructors: uniqueMembers('constructors', subject, comparison),
      boostDriver: subject.boostDriver,
      extraBoostDriver: subject.extraBoostDriver,
      transferPenalty: subject.transferPenalty,
      noNegativeActive: subject.noNegativeActive,
    },
    comparison: {
      teamName: comparison.teamName,
      racePlace: comparison.racePlace,
      raceScore: comparison.latestRaceScore,
      uniqueDrivers: uniqueMembers('drivers', comparison, subject),
      uniqueConstructors: uniqueMembers('constructors', comparison, subject),
      boostDriver: comparison.boostDriver,
      extraBoostDriver: comparison.extraBoostDriver,
      transferPenalty: comparison.transferPenalty,
      noNegativeActive: comparison.noNegativeActive,
    },
    scoreGap: subject.latestRaceScore - comparison.latestRaceScore,
  };
}

function buildKeyTeamDifferences(teams) {
  const raceOrder = [...teams]
    .sort((a, b) => b.latestRaceScore - a.latestRaceScore)
    .map((team, index) => ({ ...team, racePlace: index + 1 }));
  const winner = raceOrder[0];
  if (!winner) {
    return [];
  }

  const comparisons = [];
  if (raceOrder[1]) {
    comparisons.push(
      buildTeamDifference(winner, raceOrder[1], 'winner_vs_2nd'),
    );
  }
  if (raceOrder[2]) {
    comparisons.push(
      buildTeamDifference(winner, raceOrder[2], 'winner_vs_3rd'),
    );
  }
  const bottom = raceOrder.at(-1);
  if (bottom && raceOrder.length > 1) {
    comparisons.push(buildTeamDifference(winner, bottom, 'top_vs_bottom'));
  }

  return comparisons;
}

function buildRaceSummaryData(leagueData, lockedTeamsData, raceName = null) {
  const teams = filterExcludedGraphTeams(leagueData?.teams);
  const matchdays = [
    ...new Set(teams.flatMap((team) => Object.keys(team.raceScores || {}))),
  ].sort(
    (a, b) =>
      Number(a.replace(/^matchday_/, '')) - Number(b.replace(/^matchday_/, '')),
  );
  const latestMatchday = matchdays.at(-1) || null;
  const ranksByRound = [];
  const totals = new Map(teams.map((team) => [team, 0]));

  for (const matchday of matchdays) {
    for (const team of teams) {
      totals.set(
        team,
        totals.get(team) + (Number(team.raceScores?.[matchday]) || 0),
      );
    }
    ranksByRound.push(
      new Map(
        [...teams]
          .sort((a, b) => totals.get(b) - totals.get(a))
          .map((team, i) => [team, i + 1]),
      ),
    );
  }

  const latestMatchdayNumber = Number(
    String(latestMatchday).replace(/^matchday_/, ''),
  );
  const lockedMatchesRace =
    Number(lockedTeamsData?.matchdayId) === latestMatchdayNumber;
  const lockedByTeam = new Map();
  for (const team of filterExcludedGraphTeams(
    lockedMatchesRace ? lockedTeamsData?.teams : [],
  )) {
    for (const key of rosterKeys(team)) {
      lockedByTeam.set(key, team);
    }
  }
  const summaryTeams = teams.map((team) => {
    const lockedTeam = rosterKeys(team)
      .map((key) => lockedByTeam.get(key))
      .find(Boolean);
    const lockedTeamForScoring = lockedTeam
      ? {
          ...lockedTeam,
          matchdayId:
            lockedTeam.matchdayId ?? lockedTeamsData?.matchdayId ?? null,
        }
      : null;
    const liveOptions = lockedTeamForScoring
      ? deriveLiveScoreOptions(lockedTeamForScoring)
      : null;
    const drivers = lockedTeam?.drivers || team.drivers || [];
    const constructors =
      lockedTeam?.constructors || team.constructors || [];

    return {
      teamName: team.teamName || team.userName,
      userName: team.userName,
      accountId: team.accountId || lockedTeam?.accountId || null,
      teamNo: team.teamNo ?? lockedTeam?.teamNo ?? null,
      currentPosition: team.position,
      totalScore: team.totalScore,
      latestRaceScore: latestMatchday
        ? Number(team.raceScores?.[latestMatchday]) || 0
        : null,
      seasonRankChange:
        ranksByRound.length > 1
          ? ranksByRound.at(-2).get(team) - ranksByRound.at(-1).get(team)
          : 0,
      raceScores: team.raceScores || {},
      drivers,
      constructors,
      boostDriver: flaggedDriverName({ drivers }, 'isCaptain'),
      extraBoostDriver: flaggedDriverName({ drivers }, 'isMegaCaptain'),
      transferPenalty: liveOptions?.transferPenalty ?? null,
      noNegativeActive: liveOptions?.noNegativeActive ?? null,
      chipsUsed: lockedTeam?.chipsUsed || team.chipsUsed || [],
    };
  });

  return {
    leagueName: leagueData?.leagueName || leagueData?.leagueCode,
    latestMatchday,
    raceNumber: Number.isFinite(latestMatchdayNumber)
      ? latestMatchdayNumber
      : null,
    raceName,
    teams: summaryTeams,
    keyTeamDifferences: buildKeyTeamDifferences(summaryTeams),
  };
}

module.exports = {
  buildKeyTeamDifferences,
  buildRaceSummaryData,
  findRaceName,
};
