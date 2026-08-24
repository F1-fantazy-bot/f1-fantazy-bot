const {
  EXTRA_BOOST_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  BEST_TEAMS_RESULT_COUNT,
  EXTRA_TRANSFER_PENALTY_POINTS,
} = require('./constants');
const {
  calculateTeamInfo,
  normalizePrice,
  calculateBudgetAdjustedPoints,
} = require('./utils');

// eslint-disable-next-line max-params
exports.calculateBestTeams = function (
  cachedJsonData,
  selectedChip,
  budgetChangePointsPerMillion = 0,
  remainingRaceCount = 0,
  options = {},
) {
  // `options` is consumed by callers that want to re-rank / filter / cap the
  // top-K list (notably the web-chat agent). Keys (all optional):
  //   mustIncludeDrivers, mustExcludeDrivers,
  //   mustIncludeConstructors, mustExcludeConstructors: arrays of codes (e.g. 'VER').
  //   rankBy: null | 'points' | 'budget_adjusted'.
  //     null preserves legacy ranking (`ranking_score`, then `projected_points`).
  //   resultCount: number — defaults to BEST_TEAMS_RESULT_COUNT.
  // When `options` is omitted/empty, behaviour matches the legacy 4-arg call
  // byte-for-byte (the Telegram bot relies on this).
  const {
    mustIncludeDrivers = [],
    mustExcludeDrivers = [],
    mustIncludeConstructors = [],
    mustExcludeConstructors = [],
    rankBy = null,
    resultCount = BEST_TEAMS_RESULT_COUNT,
  } = options;
  // Data for drivers
  const drivers_dict = cachedJsonData.Drivers;

  // Data for constructors
  const constructors_dict = cachedJsonData.Constructors;

  // Current team info
  const current_team = cachedJsonData.CurrentTeam;

  // Determine free transfers and budget based on selected chip
  let freeTransfers = current_team.freeTransfers;
  const teamInfo = calculateTeamInfo(
    current_team,
    drivers_dict,
    constructors_dict
  );
  let budget = normalizePrice(teamInfo.overallBudget);

  switch (selectedChip) {
    case WILDCARD_CHIP:
      freeTransfers = 7;
      break;
    case LIMITLESS_CHIP:
      freeTransfers = 7;
      budget = 999;
      break;
  }

  // Helper function: Generate all combinations of k elements from an array
  function combinations(arr, k) {
    const result = [];
    function helper(start, combo) {
      if (combo.length === k) {
        result.push([...combo]);

        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1, combo);
        combo.pop();
      }
    }

    helper(0, []);

    return result;
  }

  const driverKeys = Object.keys(drivers_dict);
  const consKeys = Object.keys(constructors_dict);

  const driverCombos = combinations(driverKeys, 5);
  const consCombos = combinations(consKeys, 2);

  const teams = [];

  // Convert current team arrays to Sets for efficient membership tests
  const currentDriversSet = new Set(current_team.drivers);
  const currentConstructorsSet = new Set(current_team.constructors);
  const currentTeamPriceChange =
    current_team.drivers.reduce(
      (sum, dr) => sum + drivers_dict[dr].expectedPriceChange,
      0,
    ) +
    current_team.constructors.reduce(
      (sum, cn) => sum + constructors_dict[cn].expectedPriceChange,
      0,
    );

  // Iterate over all combinations: 5 drivers and 2 constructors
  for (const driverCombo of driverCombos) {
    // Driver IDs are used as keys when activity metadata is available. A
    // mid-season move can leave an owned inactive record and a new active
    // record with the same display code; those records are alternatives and
    // must never appear together in one fantasy team.
    const displayCodes = driverCombo.map(
      (driverKey) => drivers_dict[driverKey].DR || driverKey,
    );
    if (new Set(displayCodes).size !== displayCodes.length) {
      continue;
    }

    // Calculate total price, points, and expected price change for drivers
    const driver_prices = driverCombo.reduce(
      (sum, dr) => sum + drivers_dict[dr].price,
      0
    );
    const driver_points_sum = driverCombo.reduce(
      (sum, dr) => sum + drivers_dict[dr].expectedPoints,
      0
    );
    const driver_price_change = driverCombo.reduce(
      (sum, dr) => sum + drivers_dict[dr].expectedPriceChange,
      0
    );

    let boost_driver;
    let extra_boost_driver;
    driverCombo.sort(
      (a, b) => drivers_dict[b].expectedPoints - drivers_dict[a].expectedPoints
    );
    boost_driver = driverCombo[0];
    if (selectedChip === EXTRA_BOOST_CHIP) {
      // the driver with the highest expected points is selected for extra boost (x3 points)
      // the driver with the second highest expected points is selected for boost (x2 points)
      extra_boost_driver = driverCombo[0];
      boost_driver = driverCombo[1];
    }

    const bonus_boost_points = drivers_dict[boost_driver].expectedPoints;
    let extra_boost_points = 0;
    if (selectedChip === EXTRA_BOOST_CHIP) {
      extra_boost_points = drivers_dict[extra_boost_driver].expectedPoints * 2;
    }
    const total_driver_points =
      driver_points_sum + bonus_boost_points + extra_boost_points;

    for (const consCombo of consCombos) {
      // Calculate total price and points for constructors
      const cons_prices = consCombo.reduce(
        (sum, cn) => sum + constructors_dict[cn].price,
        0
      );
      const cons_points = consCombo.reduce(
        (sum, cn) => sum + constructors_dict[cn].expectedPoints,
        0
      );
      const cons_price_change = consCombo.reduce(
        (sum, cn) => sum + constructors_dict[cn].expectedPriceChange,
        0
      );

      const total_price = normalizePrice(driver_prices + cons_prices);

      // Check if the team is within the allowed budget
      if (total_price <= budget) {
        // Determine how many transfers are needed (only count players not already in the current team)
        const transfers_drivers = driverCombo.filter(
          (dr) => !currentDriversSet.has(dr)
        ).length;
        const transfers_cons = consCombo.filter(
          (cn) => !currentConstructorsSet.has(cn)
        ).length;
        const transfers_needed = transfers_drivers + transfers_cons;

        // Penalty: transfers beyond freeTransfers incur a fixed cost each.
        const penalty =
          Math.max(0, transfers_needed - freeTransfers) *
          EXTRA_TRANSFER_PENALTY_POINTS;

        // Calculate projected points:
        // (total driver points with boost bonus) + (total constructors points) - penalty.
        const projected_points = total_driver_points + cons_points - penalty;

        // Sum expected price change for the entire team
        const total_price_change = driver_price_change + cons_price_change;
        const rankingPriceChange =
          selectedChip === LIMITLESS_CHIP
            ? currentTeamPriceChange
            : total_price_change;
        const ranking_score = calculateBudgetAdjustedPoints(
          projected_points,
          rankingPriceChange,
          budgetChangePointsPerMillion,
          remainingRaceCount,
        );

        const team = {
          drivers: driverCombo,
          constructors: consCombo,
          boost_driver: boost_driver,
          total_price: total_price,
          transfers_needed: transfers_needed,
          penalty: penalty,
          projected_points: projected_points,
          expected_price_change: total_price_change,
          ranking_score,
        };

        if (selectedChip === EXTRA_BOOST_CHIP) {
          team.extra_boost_driver = extra_boost_driver;
        }
        teams.push(team);
      }
    }
  }

  // Sort the teams by the requested ranking, then keep the configured number
  // of results. `rankBy === null` preserves the legacy behaviour exactly
  // (the Telegram bot path) — `ranking_score` is the budget-adjusted value
  // (or `projected_points` when budgetChangePointsPerMillion === 0).
  if (rankBy === 'points') {
    teams.sort((a, b) => b.projected_points - a.projected_points);
  } else if (rankBy === 'budget_adjusted') {
    teams.sort((a, b) => b.ranking_score - a.ranking_score);
  } else {
    teams.sort((a, b) => {
      if (b.ranking_score !== a.ranking_score) {
        return b.ranking_score - a.ranking_score;
      }

      return b.projected_points - a.projected_points;
    });
  }

  // Apply optional must-include / must-exclude filters BEFORE slicing the
  // top-K. Filtering after slice would lose teams that rank just below
  // the original top-K cut and only become visible after filtering.
  let candidateTeams = teams;
  if (
    mustIncludeDrivers.length ||
    mustExcludeDrivers.length ||
    mustIncludeConstructors.length ||
    mustExcludeConstructors.length
  ) {
    const includeDrivers = new Set(mustIncludeDrivers);
    const excludeDrivers = new Set(mustExcludeDrivers);
    const includeConstructors = new Set(mustIncludeConstructors);
    const excludeConstructors = new Set(mustExcludeConstructors);
    candidateTeams = teams.filter((team) => {
      const driverSet = new Set(
        team.drivers.map(
          (driverKey) => drivers_dict[driverKey].DR || driverKey,
        ),
      );
      const consSet = new Set(team.constructors);
      for (const code of includeDrivers) {
        if (!driverSet.has(code)) {return false;}
      }
      for (const code of excludeDrivers) {
        if (driverSet.has(code)) {return false;}
      }
      for (const code of includeConstructors) {
        if (!consSet.has(code)) {return false;}
      }
      for (const code of excludeConstructors) {
        if (consSet.has(code)) {return false;}
      }

      return true;
    });
  }
  const top_teams = candidateTeams.slice(0, resultCount);

  // If LIMITLESS_CHIP is selected, set expected_price_change to current team's expected price change
  if (selectedChip === LIMITLESS_CHIP) {
    top_teams.forEach((team) => {
      team.expected_price_change = currentTeamPriceChange;
    });
  }

  // Add a row number to each team and rearrange the output fields
  const finalTeams = top_teams.map((team, index) => {
    const driverKeys = [...team.drivers];
    const boostDriverKey = team.boost_driver;
    const extraBoostDriverKey = team.extra_boost_driver;
    const driverCodes = driverKeys.map(
      (driverKey) => drivers_dict[driverKey].DR || driverKey,
    );
    const usesPlayerIds = driverKeys.some(
      (driverKey, driverIndex) => driverKey !== driverCodes[driverIndex],
    );
    const finalTeam = {
      ...team,
      drivers: driverCodes,
      boost_driver:
        drivers_dict[boostDriverKey]?.DR || boostDriverKey,
      budget_adjusted_points: team.ranking_score,
      row: index + 1,
    };

    if (extraBoostDriverKey) {
      finalTeam.extra_boost_driver =
        drivers_dict[extraBoostDriverKey]?.DR || extraBoostDriverKey;
    }
    if (usesPlayerIds) {
      finalTeam.driver_ids = driverKeys;
      finalTeam.boost_driver_id = boostDriverKey;
      if (extraBoostDriverKey) {
        finalTeam.extra_boost_driver_id = extraBoostDriverKey;
      }
    }

    return finalTeam;
  });

  finalTeams.forEach((team) => {
    delete team.ranking_score;
  });

  return finalTeams;
};

// eslint-disable-next-line max-params
exports.calculateChangesToTeam = function (
  cachedJsonData,
  targetTeam,
  selectedChip,
  budgetChangePointsPerMillion = 0,
  remainingRaceCount = 0,
) {
  const currentTeam = cachedJsonData.CurrentTeam;
  const currentTeamInfo = calculateTeamInfo(
    currentTeam,
    cachedJsonData.Drivers,
    cachedJsonData.Constructors
  );

  const targetDriverKeys = targetTeam.driver_ids || targetTeam.drivers;
  const displayDriver = (driverKey) =>
    cachedJsonData.Drivers[driverKey]?.DR || driverKey;

  // Determine drivers that need to be added and removed
  const driverKeysToAdd = targetDriverKeys.filter(
    (driver) => !currentTeam.drivers.includes(driver)
  );
  const driverKeysToRemove = currentTeam.drivers.filter(
    (driver) => !targetDriverKeys.includes(driver)
  );
  const driversToAdd = driverKeysToAdd.map(displayDriver);
  const driversToRemove = driverKeysToRemove.map(displayDriver);

  // Determine constructors that need to be added and removed
  const constructorsToAdd = targetTeam.constructors.filter(
    (cons) => !currentTeam.constructors.includes(cons)
  );
  const constructorsToRemove = currentTeam.constructors.filter(
    (cons) => !targetTeam.constructors.includes(cons)
  );

  // Calculate boost driver change:
  const targetBoostDriverKey =
    targetTeam.boost_driver_id || targetTeam.boost_driver;
  const boostDriverChange = currentTeam.boost !== targetBoostDriverKey;
  let newBoost = boostDriverChange
    ? displayDriver(targetBoostDriverKey)
    : undefined;
  let newBoostDriverKey = boostDriverChange
    ? targetBoostDriverKey
    : undefined;

  // Handle special chips
  let chipToActivate;
  if (selectedChip === WILDCARD_CHIP) {
    if (targetTeam.transfers_needed > currentTeam.freeTransfers) {
      chipToActivate = WILDCARD_CHIP;
    }
  }

  if (selectedChip === LIMITLESS_CHIP) {
    if (normalizePrice(targetTeam.total_price) > normalizePrice(currentTeamInfo.overallBudget)) {
      chipToActivate = LIMITLESS_CHIP;
    }
  }

  let extraBoostDriver;
  let extraBoostDriverKey;
  if (selectedChip === EXTRA_BOOST_CHIP) {
    chipToActivate = EXTRA_BOOST_CHIP;
    extraBoostDriverKey =
      targetTeam.extra_boost_driver_id || targetTeam.extra_boost_driver;
    extraBoostDriver = displayDriver(extraBoostDriverKey);
    newBoostDriverKey = targetBoostDriverKey;
    newBoost = displayDriver(targetBoostDriverKey);
  }

  const deltaPoints =
    targetTeam.projected_points - currentTeamInfo.teamExpectedPoints;
  const deltaPrice =
    targetTeam.expected_price_change - currentTeamInfo.teamPriceChange;
  const currentBudgetAdjustedPoints = calculateBudgetAdjustedPoints(
    currentTeamInfo.teamExpectedPoints,
    currentTeamInfo.teamPriceChange,
    budgetChangePointsPerMillion,
    remainingRaceCount,
  );
  const targetBudgetAdjustedPoints = Number.isFinite(
    targetTeam.budget_adjusted_points,
  )
    ? targetTeam.budget_adjusted_points
    : calculateBudgetAdjustedPoints(
        targetTeam.projected_points,
        targetTeam.expected_price_change,
        budgetChangePointsPerMillion,
        remainingRaceCount,
      );

  return {
    driversToAdd,
    driversToRemove,
    ...(targetTeam.driver_ids
      ? { driverKeysToAdd, driverKeysToRemove }
      : {}),
    constructorsToAdd,
    constructorsToRemove,
    newBoost,
    extraBoostDriver,
    ...(targetTeam.driver_ids
      ? { newBoostDriverKey, extraBoostDriverKey }
      : {}),
    chipToActivate,
    deltaPoints,
    deltaPrice,
    currentBudgetAdjustedPoints,
    targetBudgetAdjustedPoints,
    deltaBudgetAdjustedPoints:
      targetBudgetAdjustedPoints - currentBudgetAdjustedPoints,
  };
};
