// Pure league-change comparison shared by Telegram and the web agent.
// The core returns raw structured values; each surface owns localization,
// escaping, and presentation.

function pickCaptainName(team, key) {
  const drivers = Array.isArray(team?.drivers) ? team.drivers : [];
  const match = drivers.find((driver) => driver?.[key]);

  return match?.name || null;
}

function namesOf(entries) {
  return new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => entry?.name)
      .filter(Boolean),
  );
}

function findChipsForCurrentMatchday(team) {
  const matchdayId = team?.matchdayId;
  if (matchdayId === undefined || matchdayId === null) {
    return [];
  }

  return (Array.isArray(team?.chipsUsed) ? team.chipsUsed : [])
    .filter((chip) => chip && chip.gameDayId === matchdayId)
    .map((chip) => chip.name)
    .filter(Boolean);
}

function compareNames(latestEntries, planningEntries) {
  const latest = namesOf(latestEntries);
  const planning = namesOf(planningEntries);

  return {
    in: [...latest].filter((name) => !planning.has(name)),
    out: [...planning].filter((name) => !latest.has(name)),
  };
}

function compareTeamChanges(latestTeam, planningTeam) {
  if (!planningTeam) {
    return {
      isNew: true,
      hasChanges: true,
      drivers: { in: [], out: [] },
      constructors: { in: [], out: [] },
      captain: null,
      megaCaptain: null,
      chipsActivated: [],
    };
  }

  const drivers = compareNames(latestTeam?.drivers, planningTeam?.drivers);
  const constructors = compareNames(
    latestTeam?.constructors,
    planningTeam?.constructors,
  );
  const planningCaptain = pickCaptainName(planningTeam, 'isCaptain');
  const latestCaptain = pickCaptainName(latestTeam, 'isCaptain');
  const planningMegaCaptain = pickCaptainName(
    planningTeam,
    'isMegaCaptain',
  );
  const latestMegaCaptain = pickCaptainName(latestTeam, 'isMegaCaptain');
  const captain =
    planningCaptain === latestCaptain
      ? null
      : { from: planningCaptain, to: latestCaptain };
  const megaCaptain =
    planningMegaCaptain === latestMegaCaptain
      ? null
      : { from: planningMegaCaptain, to: latestMegaCaptain };
  const chipsActivated = findChipsForCurrentMatchday(latestTeam);

  return {
    isNew: false,
    hasChanges: Boolean(
      drivers.in.length ||
        drivers.out.length ||
        constructors.in.length ||
        constructors.out.length ||
        captain ||
        megaCaptain ||
        chipsActivated.length,
    ),
    drivers,
    constructors,
    captain,
    megaCaptain,
    chipsActivated,
  };
}

function normalizeTeam(latestTeam, planningTeam) {
  return {
    teamName:
      latestTeam?.teamName || latestTeam?.userName || planningTeam?.teamName || null,
    userName: latestTeam?.userName || planningTeam?.userName || null,
    position:
      typeof latestTeam?.position === 'number' &&
      Number.isFinite(latestTeam.position)
        ? latestTeam.position
        : null,
    ...compareTeamChanges(latestTeam, planningTeam),
  };
}

function compareLeagueChanges({ latest, planning } = {}) {
  if (!latest) {
    return { status: 'missing_locked' };
  }
  if (!planning) {
    return { status: 'missing_planning' };
  }

  const lockedMatchdayId = latest.matchdayId ?? null;
  const planningMatchdayId = planning.matchdayId ?? null;
  if (
    lockedMatchdayId === null ||
    planningMatchdayId === null ||
    lockedMatchdayId !== planningMatchdayId
  ) {
    return {
      status: 'matchday_mismatch',
      leagueCode: latest.leagueCode || planning.leagueCode || null,
      leagueName:
        latest.leagueName ||
        planning.leagueName ||
        latest.leagueCode ||
        planning.leagueCode ||
        null,
      lockedMatchdayId,
      planningMatchdayId,
    };
  }

  const planningByUser = new Map();
  for (const team of Array.isArray(planning.teams) ? planning.teams : []) {
    if (team?.userName) {
      planningByUser.set(team.userName, team);
    }
  }

  const teams = [...(Array.isArray(latest.teams) ? latest.teams : [])]
    .sort(
      (left, right) =>
        (left?.position || Infinity) - (right?.position || Infinity),
    )
    .map((team) => normalizeTeam(team, planningByUser.get(team?.userName)));

  return {
    status: 'ok',
    leagueCode: latest.leagueCode || planning.leagueCode || null,
    leagueName:
      latest.leagueName ||
      planning.leagueName ||
      latest.leagueCode ||
      planning.leagueCode ||
      null,
    matchdayId: lockedMatchdayId,
    teams,
    changedTeams: teams.filter((team) => team.hasChanges),
    unchangedTeams: teams.filter((team) => !team.hasChanges),
  };
}

module.exports = {
  compareLeagueChanges,
  compareTeamChanges,
  findChipsForCurrentMatchday,
  pickCaptainName,
};
