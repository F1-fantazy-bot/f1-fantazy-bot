// Pure simulation-status core. It returns safe simulation metadata plus the
// small, explicitly allowlisted projection fields needed for user-facing
// diagnostic cards. Storage details and arbitrary cache fields never leave the
// core.

const MAX_DRIVER_PROJECTION_ROWS = 30;
const MAX_CONSTRUCTOR_PROJECTION_ROWS = 15;
const RACE_NAME_NOISE = new Set([
  'after',
  'before',
  'fp',
  'gp',
  'grand',
  'post',
  'pre',
  'prix',
  'q',
  'qualifying',
  'race',
  'simulation',
  'sprint',
  'sq',
]);

function countEntries(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function normalizedRaceTokens(...values) {
  return new Set(
    values
      .filter((value) => typeof value === 'string')
      .flatMap((value) => value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3 && !RACE_NAME_NOISE.has(token))),
  );
}

function nextRaceMatchday(nextRaceInfo) {
  const candidate = Number(
    nextRaceInfo?.matchdayId ?? nextRaceInfo?.gameDayId,
  );

  return Number.isFinite(candidate) ? candidate : null;
}

function simulationMatchesNextRace({ simulationName, matchday, nextRaceInfo }) {
  if (!nextRaceInfo || typeof nextRaceInfo !== 'object') {
    return null;
  }

  const nextMatchday = nextRaceMatchday(nextRaceInfo);
  if (matchday !== null && matchday !== undefined && nextMatchday !== null) {
    return Number(matchday) === nextMatchday;
  }

  const simulationTokens = normalizedRaceTokens(simulationName);
  const nextRaceTokens = normalizedRaceTokens(
    nextRaceInfo.raceName,
    nextRaceInfo.circuitName,
    nextRaceInfo.location?.locality,
  );

  if (simulationTokens.size === 0 || nextRaceTokens.size === 0) {
    return null;
  }

  return [...simulationTokens].some((token) => nextRaceTokens.has(token));
}

function buildFreshness({ simulationName, matchday, nextRaceInfo, lastUpdate }) {
  const isNextRaceSimulation = simulationMatchesNextRace({
    simulationName,
    matchday,
    nextRaceInfo,
  });

  return {
    status:
      isNextRaceSimulation === true
        ? 'fresh'
        : isNextRaceSimulation === false
          ? 'stale'
          : 'unknown',
    updatedAt:
      typeof lastUpdate === 'string' && Number.isFinite(new Date(lastUpdate).getTime())
        ? new Date(lastUpdate).toISOString()
        : null,
  };
}

function safeCode(value, fallback) {
  const candidate = typeof value === 'string' ? value : fallback;

  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim().slice(0, 40)
    : null;
}

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function projectionNumber(entry, camelCaseKey, snakeCaseKey) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return safeNumber(entry[camelCaseKey] ?? entry[snakeCaseKey]);
}

function buildProjectionRows(entries, { codeKey, limit }) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return [];
  }

  return Object.entries(entries)
    .flatMap(([fallbackCode, entry]) => {
      const code = safeCode(entry?.[codeKey], fallbackCode);

      return code
        ? [{
            code,
            price: projectionNumber(entry, 'price', 'price'),
            expectedPoints: projectionNumber(
              entry,
              'expectedPoints',
              'expected_points',
            ),
            expectedPriceChange: projectionNumber(
              entry,
              'expectedPriceChange',
              'expected_price_change',
            ),
          }]
        : [];
    })
    .sort((left, right) => {
      const leftPoints = left.expectedPoints ?? Number.NEGATIVE_INFINITY;
      const rightPoints = right.expectedPoints ?? Number.NEGATIVE_INFINITY;

      return rightPoints - leftPoints || left.code.localeCompare(right.code);
    })
    .slice(0, limit);
}

function buildProjectionData({ drivers, constructors } = {}) {
  return {
    drivers: buildProjectionRows(drivers, {
      codeKey: 'DR',
      limit: MAX_DRIVER_PROJECTION_ROWS,
    }),
    constructors: buildProjectionRows(constructors, {
      codeKey: 'CN',
      limit: MAX_CONSTRUCTOR_PROJECTION_ROWS,
    }),
  };
}

function buildSimulationStatus({
  simulationInfo,
  drivers,
  constructors,
  pricesMetadata,
  nextRaceInfo,
  now,
} = {}) {
  const driverCount = countEntries(drivers);
  const constructorCount = countEntries(constructors);
  const hasSimulation = Boolean(
    simulationInfo && typeof simulationInfo === 'object',
  );
  const lastUpdate = hasSimulation
    ? simulationInfo.lastUpdate ?? null
    : null;

  const matchday =
    simulationInfo?.matchdayId ?? pricesMetadata?.matchdayId ?? null;

  return {
    status: hasSimulation ? 'ok' : 'not_loaded',
    source: hasSimulation
      ? {
          kind: 'simulation',
          name:
            typeof simulationInfo.name === 'string' &&
            simulationInfo.name.trim().length > 0
              ? simulationInfo.name
              : null,
        }
      : null,
    // Matchday comes from the safe price metadata when present. Keeping this
    // nullable avoids inventing a race number when the feed has not supplied
    // one yet.
    matchday,
    lastUpdate,
    freshness: buildFreshness({
      simulationName: simulationInfo?.name,
      matchday,
      nextRaceInfo,
      lastUpdate,
      now,
    }),
    available: {
      drivers: driverCount,
      constructors: constructorCount,
    },
  };
}

module.exports = {
  MAX_DRIVER_PROJECTION_ROWS,
  MAX_CONSTRUCTOR_PROJECTION_ROWS,
  countEntries,
  buildFreshness,
  simulationMatchesNextRace,
  buildProjectionRows,
  buildProjectionData,
  buildSimulationStatus,
};
