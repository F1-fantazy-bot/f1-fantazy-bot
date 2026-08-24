const INACTIVE_DRIVER_POINTS = {
  regular: -25,
  sprint: -35,
};

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function hasAlignedDriverIds(currentTeam) {
  return (
    Array.isArray(currentTeam?.drivers) &&
    Array.isArray(currentTeam?.driverIds) &&
    currentTeam.driverIds.length === currentTeam.drivers.length &&
    currentTeam.driverIds.every(
      (id) => id !== undefined && id !== null && String(id).length > 0,
    )
  );
}

function validateLegacyData({ drivers, constructors, currentTeam }) {
  const missingDrivers = (currentTeam.drivers || []).filter(
    (code) => !drivers[code],
  );
  const missingConstructors = (currentTeam.constructors || []).filter(
    (code) => !constructors[code],
  );

  if (missingDrivers.length || missingConstructors.length) {
    return {
      status: 'projection_mismatch',
      reason: 'missing_current_team_projection',
      missingDrivers,
      missingConstructors,
    };
  }

  return {
    status: 'ok',
    calculationData: {
      Drivers: drivers,
      Constructors: constructors,
      CurrentTeam: currentTeam,
    },
    usesPlayerIds: false,
  };
}

function buildCatalog(driverEntries) {
  const entries = Array.isArray(driverEntries) ? driverEntries : [];
  const enrichedEntries = entries.filter(
    (entry) =>
      entry?.id !== undefined &&
      entry?.id !== null &&
      normalizeCode(entry.code) &&
      typeof entry.isActive === 'boolean',
  );

  return {
    hasActivityMetadata: enrichedEntries.length > 0,
    entries: enrichedEntries.map((entry) => ({
      ...entry,
      id: String(entry.id),
      code: normalizeCode(entry.code),
      price: Number(entry.price),
    })),
  };
}

function getInactiveDriverPoints(nextRaceInfo) {
  const weekendFormat = nextRaceInfo?.weekendFormat;

  return INACTIVE_DRIVER_POINTS[weekendFormat] ?? null;
}

function buildIdAwareData({
  drivers,
  constructors,
  currentTeam,
  driverEntries,
  nextRaceInfo,
}) {
  const catalog = buildCatalog(driverEntries);
  if (!catalog.hasActivityMetadata) {
    return {
      status: 'projection_mismatch',
      reason: 'missing_player_activity_metadata',
    };
  }

  const entriesById = new Map(
    catalog.entries.map((entry) => [entry.id, entry]),
  );
  const activeEntries = catalog.entries.filter((entry) => entry.isActive);
  const activeCodes = new Set();
  const duplicateActiveCodes = new Set();

  for (const entry of activeEntries) {
    if (activeCodes.has(entry.code)) {
      duplicateActiveCodes.add(entry.code);
    }
    activeCodes.add(entry.code);
  }

  if (duplicateActiveCodes.size > 0) {
    return {
      status: 'projection_mismatch',
      reason: 'duplicate_active_driver_code',
      duplicateActiveCodes: [...duplicateActiveCodes],
    };
  }

  const calculationDrivers = {};
  const missingActiveProjections = [];
  const invalidActivePrices = [];

  for (const entry of activeEntries) {
    const projection = drivers[entry.code];
    if (!projection) {
      missingActiveProjections.push(entry.code);
      continue;
    }
    if (!Number.isFinite(entry.price)) {
      invalidActivePrices.push(entry.code);
      continue;
    }

    calculationDrivers[entry.id] = {
      ...projection,
      DR: entry.code,
      name: entry.name,
      playerId: entry.id,
      teamId: entry.teamId,
      teamName: entry.teamName,
      isActive: true,
      price: entry.price,
    };
  }

  if (missingActiveProjections.length || invalidActivePrices.length) {
    return {
      status: 'projection_mismatch',
      reason: 'invalid_active_driver_data',
      missingActiveProjections,
      invalidActivePrices,
    };
  }

  const currentDriverIds = currentTeam.driverIds.map(String);
  const missingCurrentDriverIds = currentDriverIds.filter(
    (id) => !entriesById.has(id),
  );
  if (missingCurrentDriverIds.length > 0) {
    return {
      status: 'projection_mismatch',
      reason: 'missing_current_driver_identity',
      missingCurrentDriverIds,
    };
  }

  const ownedInactiveEntries = currentDriverIds
    .map((id) => entriesById.get(id))
    .filter((entry) => !entry.isActive);
  if (ownedInactiveEntries.length > 0) {
    const inactivePoints = getInactiveDriverPoints(nextRaceInfo);
    if (!Number.isFinite(inactivePoints)) {
      return {
        status: 'missing_weekend_format',
        inactiveDriverIds: ownedInactiveEntries.map((entry) => entry.id),
      };
    }

    for (const entry of ownedInactiveEntries) {
      if (!Number.isFinite(entry.price)) {
        return {
          status: 'projection_mismatch',
          reason: 'invalid_inactive_driver_price',
          invalidDriverIds: [entry.id],
        };
      }
      calculationDrivers[entry.id] = {
        DR: entry.code,
        name: entry.name,
        playerId: entry.id,
        teamId: entry.teamId,
        teamName: entry.teamName,
        isActive: false,
        price: entry.price,
        expectedPoints: inactivePoints,
        expectedPriceChange: 0,
      };
    }
  }

  const missingConstructors = (currentTeam.constructors || []).filter(
    (code) => !constructors[code],
  );
  if (missingConstructors.length > 0) {
    return {
      status: 'projection_mismatch',
      reason: 'missing_current_team_projection',
      missingDrivers: [],
      missingConstructors,
    };
  }

  let boostDriverId = currentTeam.boostDriverId
    ? String(currentTeam.boostDriverId)
    : null;
  if (!boostDriverId) {
    const boostIndex = (currentTeam.drivers || []).findIndex(
      (code) => code === currentTeam.boost,
    );
    boostDriverId =
      boostIndex >= 0 ? currentDriverIds[boostIndex] : currentDriverIds[0];
  }

  if (!boostDriverId || !calculationDrivers[boostDriverId]) {
    return {
      status: 'projection_mismatch',
      reason: 'missing_boost_driver_identity',
    };
  }

  return {
    status: 'ok',
    usesPlayerIds: true,
    calculationData: {
      Drivers: calculationDrivers,
      Constructors: constructors,
      CurrentTeam: {
        ...currentTeam,
        drivers: currentDriverIds,
        boost: boostDriverId,
      },
    },
  };
}

function prepareBestTeamsData({
  drivers,
  constructors,
  currentTeam,
  driverEntries,
  nextRaceInfo,
}) {
  if (!drivers || !constructors || !currentTeam) {
    return { status: 'missing_cache' };
  }

  if (!hasAlignedDriverIds(currentTeam)) {
    return validateLegacyData({ drivers, constructors, currentTeam });
  }

  return buildIdAwareData({
    drivers,
    constructors,
    currentTeam,
    driverEntries,
    nextRaceInfo,
  });
}

module.exports = {
  INACTIVE_DRIVER_POINTS,
  getInactiveDriverPoints,
  prepareBestTeamsData,
};
