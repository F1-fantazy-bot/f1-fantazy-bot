const {
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
} = require('./constants');
const { calculateTeamInfo } = require('./utils');

exports.calculateBestTeams = function (cachedJsonData, selectedChip) {
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
  let budget = teamInfo.overallBudget;

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

  // Iterate over all combinations: 5 drivers and 2 constructors
  for (const driverCombo of driverCombos) {
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

    let drs_driver;
    let extra_drs_driver;
    driverCombo.sort(
      (a, b) => drivers_dict[b].expectedPoints - drivers_dict[a].expectedPoints
    );
    drs_driver = driverCombo[0];
    if (selectedChip === EXTRA_DRS_CHIP) {
      // the driver with the highest expected points is selected for extra DRS (x3 points)
      // the driver with the second highest expected points is selected for DRS (x2 points)
      extra_drs_driver = driverCombo[0];
      drs_driver = driverCombo[1];
    }

    const bonus_drs_points = drivers_dict[drs_driver].expectedPoints;
    let extra_drs_points = 0;
    if (selectedChip === EXTRA_DRS_CHIP) {
      extra_drs_points = drivers_dict[extra_drs_driver].expectedPoints * 2;
    }
    const total_driver_points =
      driver_points_sum + bonus_drs_points + extra_drs_points;

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

      const total_price = driver_prices + cons_prices;

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

        // Penalty: transfers beyond freeTransfers incur 10 points each.
        const penalty = Math.max(0, transfers_needed - freeTransfers) * 10;

        // Calculate projected points:
        // (total driver points with DRS bonus) + (total constructors points) - penalty.
        const projected_points = total_driver_points + cons_points - penalty;

        // Sum expected price change for the entire team
        const total_price_change = driver_price_change + cons_price_change;

        const team = {
          drivers: driverCombo,
          constructors: consCombo,
          drs_driver: drs_driver,
          total_price: total_price,
          transfers_needed: transfers_needed,
          penalty: penalty,
          projected_points: projected_points,
          expected_price_change: total_price_change,
        };

        if (selectedChip === EXTRA_DRS_CHIP) {
          team.extra_drs_driver = extra_drs_driver;
        }
        teams.push(team);
      }
    }
  }

  // Sort the teams by projected points in descending order and select the top 20
  teams.sort((a, b) => b.projected_points - a.projected_points);
  const top_teams = teams.slice(0, selectedChip === EXTRA_DRS_CHIP ? 19 : 20);

  // If LIMITLESS_CHIP is selected, set expected_price_change to current team's expected price change
  if (selectedChip === LIMITLESS_CHIP) {
    const currentDrivers = current_team.drivers;
    const currentConstructors = current_team.constructors;
    const currentDriversPriceChange = currentDrivers.reduce(
      (sum, dr) => sum + drivers_dict[dr].expectedPriceChange,
      0
    );
    const currentConstructorsPriceChange = currentConstructors.reduce(
      (sum, cn) => sum + constructors_dict[cn].expectedPriceChange,
      0
    );
    const currentTeamPriceChange =
      currentDriversPriceChange + currentConstructorsPriceChange;
    top_teams.forEach((team) => {
      team.expected_price_change = currentTeamPriceChange;
    });
  }

  // Add a row number to each team and rearrange the output fields
  const finalTeams = top_teams.map((team, index) => ({
    ...team,
    row: index + 1,
  }));

  return finalTeams;
};

exports.calculateChangesToTeam = function (
  cachedJsonData,
  targetTeam,
  selectedChip
) {
  const currentTeam = cachedJsonData.CurrentTeam;
  const currentTeamInfo = calculateTeamInfo(
    currentTeam,
    cachedJsonData.Drivers,
    cachedJsonData.Constructors
  );

  // Determine drivers that need to be added and removed
  const driversToAdd = targetTeam.drivers.filter(
    (driver) => !currentTeam.drivers.includes(driver)
  );
  const driversToRemove = currentTeam.drivers.filter(
    (driver) => !targetTeam.drivers.includes(driver)
  );

  // Determine constructors that need to be added and removed
  const constructorsToAdd = targetTeam.constructors.filter(
    (cons) => !currentTeam.constructors.includes(cons)
  );
  const constructorsToRemove = currentTeam.constructors.filter(
    (cons) => !targetTeam.constructors.includes(cons)
  );

  // Calculate DRS driver change:
  const drs_driver_change = currentTeam.drsBoost !== targetTeam.drs_driver;
  let newDRS = drs_driver_change ? targetTeam.drs_driver : undefined;

  // Handle special chips
  let chipToActivate;
  if (selectedChip === WILDCARD_CHIP) {
    if (targetTeam.transfers_needed > currentTeam.freeTransfers) {
      chipToActivate = WILDCARD_CHIP;
    }
  }

  if (selectedChip === LIMITLESS_CHIP) {
    if (targetTeam.total_price > currentTeamInfo.overallBudget) {
      chipToActivate = LIMITLESS_CHIP;
    }
  }

  let extraDrsDriver;
  if (selectedChip === EXTRA_DRS_CHIP) {
    chipToActivate = EXTRA_DRS_CHIP;
    extraDrsDriver = targetTeam.extra_drs_driver;
    newDRS = targetTeam.drs_driver;
  }

  const deltaPoints =
    targetTeam.projected_points - currentTeamInfo.teamExpectedPoints;
  const deltaPrice =
    targetTeam.expected_price_change - currentTeamInfo.teamPriceChange;

  return {
    driversToAdd,
    driversToRemove,
    constructorsToAdd,
    constructorsToRemove,
    newDRS,
    extraDrsDriver,
    chipToActivate,
    deltaPoints,
    deltaPrice,
  };
};
