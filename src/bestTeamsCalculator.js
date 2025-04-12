exports.calculateBestTeams = function (jsonData) {
    // Data for drivers
    const drivers_data = jsonData.Drivers;
    
    // Data for constructors
    const constructors_data = jsonData.Constructors;
    
    // Create lookup dictionaries for fast access
    const drivers_dict = {};
    drivers_data.forEach(driver => {
        drivers_dict[driver.DR] = driver;
    });
    
    const constructors_dict = {};
    constructors_data.forEach(cons => {
        constructors_dict[cons.CN] = cons;
    });
    
    // Current team info
    const current_team = jsonData.CurrentTeam;
    
    // Calculate current team total price and overall budget (price + remaining costCap)
    let current_team_price = 0;
    current_team.drivers.forEach(dr => {
        current_team_price += drivers_dict[dr].price;
    });
    current_team.constructors.forEach(cn => {
        current_team_price += constructors_dict[cn].price;
    });
    const budget = current_team_price + current_team.costCapRemaining;
    
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
        const driver_prices = driverCombo.reduce((sum, dr) => sum + drivers_dict[dr].price, 0);
        const driver_points_sum = driverCombo.reduce((sum, dr) => sum + drivers_dict[dr].expectedPoints, 0);
        const driver_price_change = driverCombo.reduce((sum, dr) => sum + drivers_dict[dr].expectedPriceChange, 0);
    
        // Determine best candidate for DRS (highest expected points)
        let drs_driver = driverCombo[0];
        for (const dr of driverCombo) {
        if (drivers_dict[dr].expectedPoints > drivers_dict[drs_driver].expectedPoints) {
            drs_driver = dr;
        }
        }
        const bonus_drs_points = drivers_dict[drs_driver].expectedPoints;
        const total_driver_points = driver_points_sum + bonus_drs_points;
    
        for (const consCombo of consCombos) {
        // Calculate total price and points for constructors
        const cons_prices = consCombo.reduce((sum, cn) => sum + constructors_dict[cn].price, 0);
        const cons_points = consCombo.reduce((sum, cn) => sum + constructors_dict[cn].expectedPoints, 0);
        const cons_price_change = consCombo.reduce((sum, cn) => sum + constructors_dict[cn].expectedPriceChange, 0);
    
        const total_price = driver_prices + cons_prices;
    
        // Check if the team is within the allowed budget
        if (total_price <= budget) {
            // Determine how many transfers are needed (only count players not already in the current team)
            const transfers_drivers = driverCombo.filter(dr => !currentDriversSet.has(dr)).length;
            const transfers_cons = consCombo.filter(cn => !currentConstructorsSet.has(cn)).length;
            const transfers_needed = transfers_drivers + transfers_cons;
    
            // Penalty: transfers beyond freeTransfers incur 10 points each.
            const penalty = Math.max(0, transfers_needed - current_team.freeTransfers) * 10;
    
            // Calculate projected points:
            // (total driver points with DRS bonus) + (total constructors points) - penalty.
            const projected_points = total_driver_points + cons_points - penalty;
    
            // Sum expected price change for the entire team
            const total_price_change = driver_price_change + cons_price_change;
    
            teams.push({
            drivers: driverCombo,
            constructors: consCombo,
            drs_driver: drs_driver,
            total_price: total_price,
            transfers_needed: transfers_needed,
            penalty: penalty,
            projected_points: projected_points,
            expected_price_change: total_price_change
            });
        }
        }
    }
    
    // Sort the teams by projected points in descending order and select the top 20
    teams.sort((a, b) => b.projected_points - a.projected_points);
    const top_teams = teams.slice(0,20);
    
    // Add a row number to each team and rearrange the output fields
    const finalTeams = top_teams.map((team, index) => ({
        row: index + 1,
        drivers: team.drivers,
        constructors: team.constructors,
        drs_driver: team.drs_driver,
        total_price: team.total_price,
        transfers_needed: team.transfers_needed,
        penalty: team.penalty,
        projected_points: team.projected_points,
        expected_price_change: team.expected_price_change
    }));
    
    return finalTeams;
}

exports.calculateChangesToTeam = function (currentTeam, targetTeam) {    
    // Determine drivers that need to be added and removed
    const driversToAdd = targetTeam.drivers.filter(driver => !currentTeam.drivers.includes(driver));
    const driversToRemove = currentTeam.drivers.filter(driver => !targetTeam.drivers.includes(driver));
    
    // Determine constructors that need to be added and removed
    const constructorsToAdd = targetTeam.constructors.filter(cons => !currentTeam.constructors.includes(cons));
    const constructorsToRemove = currentTeam.constructors.filter(cons => !targetTeam.constructors.includes(cons));
    
    // Calculate DRS driver change:
    // If currentTeam has a drs_driver property, compare; if not, assume a change is needed.
    const drs_driver_change = currentTeam.drs_driver !== targetTeam.drs_driver;
    const newDRS = drs_driver_change ? targetTeam.drs_driver : undefined;
    
    return {
        driversToAdd,
        driversToRemove,
        constructorsToAdd,
        constructorsToRemove,
        newDRS
    };
};