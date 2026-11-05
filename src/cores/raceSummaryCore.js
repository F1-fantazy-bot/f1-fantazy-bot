// Pure race-summary source-data construction shared by Telegram and the web
// agent. This module owns facts only; model calls, localization, telemetry,
// storage, and presentation remain in their adapters/services.
const { filterExcludedGraphTeams } = require('../utils/leagueGraphFilter');
const { buildLeagueTeamIdentityKey } = require('../utils/teamId');
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

function normalized(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function legacyContextMatches(team, locked) {
  return normalized(team.userName) === normalized(locked.userName) &&
    Number(team.teamNo || 1) === Number(locked.teamNo || 1);
}

function resolveLockedRoster(team, lockedTeams) {
  const identity = buildLeagueTeamIdentityKey(team.accountId, team.teamNo);
  if (identity) {
    const exact = lockedTeams.filter((locked) =>
      buildLeagueTeamIdentityKey(locked.accountId, locked.teamNo) === identity);
    if (exact.length === 1) {return { team: exact[0], status: 'exact_account' };}
    if (exact.length > 1) {return { team: null, status: 'ambiguous_legacy_identity' };}
  }
  // Account-aware rows from another account must never be matched through
  // display fields. Only snapshots predating account IDs use legacy matching.
  const historical = lockedTeams.filter((locked) => !locked.accountId &&
    legacyContextMatches(team, locked));
  const nameMatches = historical.filter((locked) =>
    normalized(team.teamName) && normalized(team.teamName) === normalized(locked.teamName));
  if (nameMatches.length === 1) {return { team: nameMatches[0], status: 'legacy_team_name' };}
  if (nameMatches.length > 1) {return { team: null, status: 'ambiguous_legacy_identity' };}
  if (historical.length === 1) {return { team: historical[0], status: 'legacy_unique_identity' };}

  return { team: null, status: historical.length > 1 ? 'ambiguous_legacy_identity' : 'missing' };
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

  const subjectDrivers = rosterNames(subject, 'drivers');
  const comparisonDrivers = rosterNames(comparison, 'drivers');
  const subjectConstructors = rosterNames(subject, 'constructors');
  const comparisonConstructors = rosterNames(comparison, 'constructors');
  const sameNames = (a, b) => a.length === b.length &&
    [...a].sort().every((name, index) => name === [...b].sort()[index]);
  const sameRosterMembers = sameNames(subjectDrivers, comparisonDrivers) &&
    sameNames(subjectConstructors, comparisonConstructors);
  const sameBoostConfiguration = subject.boostDriver === comparison.boostDriver &&
    subject.extraBoostDriver === comparison.extraBoostDriver;
  const sameActiveChips = sameNames(
    [...new Set(subject.activeChips || [])],
    [...new Set(comparison.activeChips || [])],
  );
  const sameTransferPenalty = subject.transferPenalty !== null &&
    subject.transferPenalty !== undefined &&
    subject.transferPenalty === comparison.transferPenalty &&
    subject.transferPenaltyWaived === comparison.transferPenaltyWaived;
  const fields = (team, other) => ({
    teamName: team.teamName,
    racePlace: team.racePlace,
    raceScore: team.latestRaceScore,
    uniqueDrivers: uniqueMembers('drivers', team, other),
    uniqueConstructors: uniqueMembers('constructors', team, other),
    boostDriver: team.boostDriver || null,
    extraBoostDriver: team.extraBoostDriver || null,
    transferPenalty: team.transferPenalty,
    transferPenaltyWaived: team.transferPenaltyWaived,
    chips: team.activeChips || [],
    noNegativeActive: team.noNegativeActive || false,
    rosterMatchStatus: team.rosterMatchStatus,
  });

  return {
    label,
    subject: fields(subject, comparison),
    comparison: fields(comparison, subject),
    sameRosterMembers,
    sameBoostConfiguration,
    sameActiveChips,
    sameTransferPenalty,
    sameRaceConfiguration: sameRosterMembers && sameBoostConfiguration &&
      sameActiveChips && sameTransferPenalty,
    penaltyGap: subject.transferPenalty === null || subject.transferPenalty === undefined ||
      comparison.transferPenalty === null || comparison.transferPenalty === undefined
      ? null : subject.transferPenalty - comparison.transferPenalty,
    chipDifferences: !sameActiveChips,
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
  const lockedTeams = filterExcludedGraphTeams(
    lockedMatchesRace ? lockedTeamsData?.teams : [],
  );
  const summaryTeams = teams.map((team) => {
    const { team: lockedTeam, status: rosterMatchStatus } =
      resolveLockedRoster(team, lockedTeams);
    const drivers = lockedTeam?.drivers || (lockedMatchesRace ? [] : team.drivers || []);
    const constructors = lockedTeam?.constructors || (lockedMatchesRace ? [] : team.constructors || []);
    const chipsUsed = lockedTeam?.chipsUsed || (lockedMatchesRace ? [] : team.chipsUsed || []);
    const { transferPenalty, noNegativeActive } = lockedTeam
      ? deriveLiveScoreOptions({ ...lockedTeam,
        matchdayId: lockedTeam.matchdayId ?? latestMatchdayNumber,
        chipsUsed: chipsUsed.map((chip) => ({ ...chip,
          gameDayId: Number(chip.gameDayId) })),
      })
      : { transferPenalty: null, noNegativeActive: false };
    const activeChips = lockedTeam ? chipsUsed.filter((chip) =>
      Number(chip.gameDayId) === latestMatchdayNumber)
      .map((chip) => chip.name).filter(Boolean) : [];
    const normalizedActiveChips = [...new Set(activeChips)].sort();
    const transferPenaltyWaived = lockedTeam
      ? normalizedActiveChips.some((name) => name === 'Wildcard' || name === 'Limitless')
      : null;

    return {
      teamName: team.teamName || team.userName,
      userName: team.userName,
      teamNo: team.teamNo,
      accountId: team.accountId || null,
      rosterMatchStatus,
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
      activeChips: normalizedActiveChips,
      noNegativeActive,
      transferPenaltyWaived,
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
  resolveLockedRoster,
};
