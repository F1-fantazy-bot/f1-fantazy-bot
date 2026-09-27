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

function rosterKey(team) {
  return (
    buildLeagueTeamId(
      team?.userName,
      team?.teamNo,
      team?.accountId,
    ) ||
    `${team?.teamName || team?.userName || ''}:${team?.teamNo || 1}`
  );
}

function memberName(member) {
  return typeof member === 'string' ? member : member?.name;
}

function rosterNames(team, field) {
  return (Array.isArray(team?.[field]) ? team[field] : [])
    .map(memberName)
    .filter(Boolean);
}

function flaggedMemberName(team, flag) {
  const drivers = Array.isArray(team?.drivers) ? team.drivers : [];
  const match = drivers.find((driver) => driver?.[flag]);

  return match?.name || null;
}

function buildTeamDifference(subject, comparison, label) {
  const uniqueMembers = (field, first, second) => {
    const secondNames = new Set(rosterNames(second, field));

    return rosterNames(first, field).filter((name) => !secondNames.has(name));
  };

  return {
    label,
    subject: {
      teamName: subject.teamName,
      racePlace: subject.racePlace,
      raceScore: subject.latestRaceScore,
      uniqueDrivers: uniqueMembers('drivers', subject, comparison),
      uniqueConstructors: uniqueMembers('constructors', subject, comparison),
      boostDriver: subject.boostDriver || null,
      extraBoostDriver: subject.extraBoostDriver || null,
      transferPenalty: Number(subject.transferPenalty) || 0,
    },
    comparison: {
      teamName: comparison.teamName,
      racePlace: comparison.racePlace,
      raceScore: comparison.latestRaceScore,
      uniqueDrivers: uniqueMembers('drivers', comparison, subject),
      uniqueConstructors: uniqueMembers('constructors', comparison, subject),
      boostDriver: comparison.boostDriver || null,
      extraBoostDriver: comparison.extraBoostDriver || null,
      transferPenalty: Number(comparison.transferPenalty) || 0,
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
  if (bottom && bottom.teamName !== winner.teamName) {
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
  const lockedByTeam = new Map(
    filterExcludedGraphTeams(
      lockedMatchesRace ? lockedTeamsData?.teams : [],
    ).map((team) => [rosterKey(team), team]),
  );
  const summaryTeams = teams.map((team) => {
    const lockedTeam = lockedByTeam.get(rosterKey(team));
    const drivers = lockedTeam?.drivers || team.drivers || [];
    const constructors = lockedTeam?.constructors || team.constructors || [];
    const chipsUsed = lockedTeam?.chipsUsed || team.chipsUsed || [];
    const { transferPenalty } = lockedTeam
      ? deriveLiveScoreOptions(lockedTeam)
      : { transferPenalty: 0 };

    return {
      teamName: team.teamName || team.userName,
      userName: team.userName,
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
      chipsUsed,
      boostDriver: flaggedMemberName({ drivers }, 'isCaptain'),
      extraBoostDriver: flaggedMemberName({ drivers }, 'isMegaCaptain'),
      transferPenalty,
      transfersRemaining: lockedTeam?.transfersRemaining ?? null,
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
