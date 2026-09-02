// Pure, agent-safe diagnostic summary. Raw cache JSON stays exclusively in the
// Telegram `/print_cache` adapter; this core returns only allowlisted
// projections, roster fields, metadata, state flags, and user-action keys.

const {
  countEntries,
  buildProjectionData,
  buildSimulationStatus,
} = require('./simulationStatusCore');

const MAX_SAVED_TEAMS = 8;
const MAX_TEAM_DRIVERS = 5;
const MAX_TEAM_CONSTRUCTORS = 2;
const PPM_PRESETS = new Set([0, 1.3, 1.65, 2]);

function teamDisplayName(team, teamId) {
  return typeof team?.teamName === 'string' && team.teamName.trim().length > 0
    ? team.teamName
    : teamId || null;
}

function safeString(value, maxLength = 80) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function safeStringList(value, limit) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string' && item.trim())
        .slice(0, limit)
        .map((item) => item.trim().slice(0, 40))
    : [];
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(2))
    : null;
}

function safePpmPreset(value) {
  const ppm = Number(value);

  return PPM_PRESETS.has(ppm) ? ppm : 0;
}

function buildSavedTeams({
  teams,
  selectedTeamId,
  chipsByTeam,
  ppmByTeam,
} = {}) {
  if (!teams || typeof teams !== 'object' || Array.isArray(teams)) {
    return [];
  }

  return Object.entries(teams)
    .flatMap(([teamId, team]) => {
      const id = safeString(teamId, 80);
      if (!id || !team || typeof team !== 'object' || Array.isArray(team)) {
        return [];
      }

      const roster = {
        drivers: safeStringList(team.drivers, MAX_TEAM_DRIVERS),
        constructors: safeStringList(
          team.constructors,
          MAX_TEAM_CONSTRUCTORS,
        ),
        boost: safeString(team.boost ?? team.boostDriver, 40),
      };

      return [{
        teamId: id,
        teamName: safeString(team.teamName) || id,
        isSelected: teamId === selectedTeamId,
        chip: safeString(chipsByTeam?.[teamId], 40),
        ...roster,
        freeTransfers: safeNumber(team.freeTransfers),
        costCapRemaining: safeNumber(team.costCapRemaining),
        budgetChangePointsPerMillion: safePpmPreset(ppmByTeam?.[teamId]),
      }];
    })
    .sort((left, right) => {
      if (left.isSelected !== right.isSelected) {
        return left.isSelected ? -1 : 1;
      }

      return left.teamName.localeCompare(right.teamName);
    })
    .slice(0, MAX_SAVED_TEAMS);
}

function buildDataStatus({
  simulationInfo,
  sharedDrivers,
  sharedConstructors,
  drivers,
  constructors,
  pricesMetadata,
  nextRaceInfo,
  teams,
  selectedTeamId,
  chipsByTeam,
  ppmByTeam,
  projectionSource,
  printableCache,
  now,
} = {}) {
  const simulation = buildSimulationStatus({
    simulationInfo,
    drivers: sharedDrivers,
    constructors: sharedConstructors,
    pricesMetadata,
    nextRaceInfo,
    now,
  });
  const driversCount = countEntries(drivers);
  const constructorsCount = countEntries(constructors);
  const ownedTeams = teams && typeof teams === 'object' ? teams : {};
  const ownedCount = countEntries(ownedTeams);
  const hasSelectedTeam = Boolean(selectedTeamId && ownedTeams[selectedTeamId]);
  const missingPrerequisites = [];

  if (simulation.status !== 'ok') {
    missingPrerequisites.push('simulation');
  }
  if (driversCount === 0) {
    missingPrerequisites.push('drivers');
  }
  if (constructorsCount === 0) {
    missingPrerequisites.push('constructors');
  }
  if (ownedCount === 0) {
    missingPrerequisites.push('owned_team');
  } else if (!hasSelectedTeam) {
    missingPrerequisites.push('selected_team');
  }

  const nextActions = [];
  if (missingPrerequisites.includes('simulation')) {
    nextActions.push('refresh_simulation');
  }
  if (missingPrerequisites.includes('drivers') || missingPrerequisites.includes('constructors')) {
    nextActions.push('refresh_projections');
  }
  if (missingPrerequisites.includes('owned_team')) {
    nextActions.push('add_team');
  } else if (missingPrerequisites.includes('selected_team')) {
    nextActions.push('select_team');
  }

  const source =
    driversCount === 0 && constructorsCount === 0
      ? 'unavailable'
      : projectionSource === 'personal_or_mixed'
        ? 'personal_or_mixed'
        : 'simulation';

  return {
    status: missingPrerequisites.length === 0 ? 'ok' : 'incomplete',
    source,
    simulation: {
      status: simulation.status,
      name: simulation.source?.name || null,
      matchday: simulation.matchday,
      freshness: simulation.freshness,
    },
    projections: {
      drivers: driversCount,
      constructors: constructorsCount,
      available: driversCount > 0 && constructorsCount > 0,
    },
    teams: {
      ownedCount,
      selected: hasSelectedTeam
        ? teamDisplayName(ownedTeams[selectedTeamId], selectedTeamId)
        : null,
      hasSelectedTeam,
    },
    cache: {
      projections: buildProjectionData({ drivers, constructors }),
      teams: buildSavedTeams({
        teams: ownedTeams,
        selectedTeamId,
        chipsByTeam,
        ppmByTeam,
      }),
    },
    missingPrerequisites,
    nextActions,
    // This mirrors the exact truthiness check used by Telegram's legacy
    // formatter, while never returning the raw printable payload itself.
    printableCacheAvailable: Boolean(printableCache),
  };
}

module.exports = {
  MAX_SAVED_TEAMS,
  MAX_TEAM_DRIVERS,
  MAX_TEAM_CONSTRUCTORS,
  PPM_PRESETS,
  buildDataStatus,
  buildSavedTeams,
  safePpmPreset,
  teamDisplayName,
};
