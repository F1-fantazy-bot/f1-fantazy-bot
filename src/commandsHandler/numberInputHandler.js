const { calculateChangesToTeam } = require('../bestTeamsCalculator');
const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  selectedChipCache,
  sharedKey,
} = require('../cache');
const { COMMAND_BEST_TEAMS } = require('../constants');

// Handles the case when the message text is a number
async function handleNumberMessage(bot, chatId, textTrimmed) {
  const teamRowRequested = parseInt(textTrimmed, 10);

  if (bestTeamsCache[chatId]) {
    const currentTeam = bestTeamsCache[chatId].currentTeam;
    const selectedTeam = bestTeamsCache[chatId].bestTeams.find(
      (t) => t.row === teamRowRequested
    );

    if (selectedTeam) {
      if (
        selectedTeam.transfers_needed === 0 &&
        !selectedTeam.extra_drs_driver // if the user uses the extra drs chip we need to show the changes
      ) {
        await bot
          .sendMessage(
            chatId,
            `You are already at team ${teamRowRequested}. No changes needed.`
          )
          .catch((err) =>
            console.error('Error sending no changes message:', err)
          );

        return;
      }

      // Build cachedJsonData object
      const cachedJsonData = {
        Drivers: driversCache[chatId] || driversCache[sharedKey],
        Constructors: constructorsCache[chatId] || constructorsCache[sharedKey],
        CurrentTeam: currentTeam,
      };
      const changesToTeam = calculateChangesToTeam(
        cachedJsonData,
        selectedTeam,
        selectedChipCache[chatId]
      );

      let changesToTeamMessage = getRequiredChangesMessage(
        teamRowRequested,
        changesToTeam,
        selectedChipCache[chatId]
      );
      changesToTeamMessage += getSelectedTeamInfo(
        teamRowRequested,
        selectedTeam,
        changesToTeam
      );

      changesToTeamMessage += getDriverAndConstructorsDetailsMessage(
        cachedJsonData,
        changesToTeam
      );

      await bot
        .sendMessage(chatId, changesToTeamMessage, { parse_mode: 'Markdown' })
        .catch((err) =>
          console.error('Error sending changes to team message:', err)
        );
    } else {
      await bot
        .sendMessage(chatId, `No team found for number ${teamRowRequested}.`)
        .catch((err) =>
          console.error('Error sending team not found message:', err)
        );
    }
  } else {
    await bot
      .sendMessage(
        chatId,
        `No cached teams available. Please send full JSON data or images first and then run the ${COMMAND_BEST_TEAMS} command.`
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );
  }
}

module.exports = { handleNumberMessage };

function getRequiredChangesMessage(
  teamRowRequested,
  changesToTeam,
  selectedChip
) {
  let message = `*Team ${teamRowRequested} Required Changes:*\n`;
  if (changesToTeam.driversToAdd.length) {
    message += `*Drivers To Add:* ${changesToTeam.driversToAdd.join(', ')}\n`;
  }

  if (changesToTeam.driversToRemove.length) {
    message += `*Drivers To Remove:* ${changesToTeam.driversToRemove.join(
      ', '
    )}\n`;
  }

  if (changesToTeam.constructorsToAdd.length) {
    message += `*Constructors To Add:* ${changesToTeam.constructorsToAdd.join(
      ', '
    )}\n`;
  }
  if (changesToTeam.constructorsToRemove.length) {
    message += `*Constructors To Remove:* ${changesToTeam.constructorsToRemove.join(
      ', '
    )}\n`;
  }

  if (changesToTeam.extraDrsDriver) {
    message += `*Extra DRS Driver:* ${changesToTeam.extraDrsDriver}\n`;
  }

  if (changesToTeam.newDRS !== undefined) {
    message += `*${changesToTeam.extraDrsDriver ? '' : 'New '}DRS Driver:* ${
      changesToTeam.newDRS
    }\n`;
  }

  if (changesToTeam.chipToActivate !== undefined) {
    message += `*Chip To Activate:* ${selectedChip.replace(/_/g, ' ')}\n`;
  }

  return message;
}

function getSelectedTeamInfo(teamRowRequested, selectedTeam, changesToTeam) {
  let message = `\n*Team ${teamRowRequested} Info:*\n`;
  message += `*Projected Points:* ${selectedTeam.projected_points.toFixed(
    2
  )}\n`;
  message += `*Expected Price Change:* ${selectedTeam.expected_price_change.toFixed(
    2
  )}M\n`;

  if (changesToTeam.deltaPoints !== undefined) {
    message += `*Δ Points:* ${
      changesToTeam.deltaPoints > 0 ? '+' : ''
    }${changesToTeam.deltaPoints.toFixed(2)}\n`;
  }
  if (changesToTeam.deltaPrice !== undefined) {
    message += `*Δ Price:* ${
      changesToTeam.deltaPrice > 0 ? '+' : ''
    }${changesToTeam.deltaPrice.toFixed(2)}M`;
  }

  return message;
}

function getDriverAndConstructorsDetailsMessage(cachedJsonData, changesToTeam) {
  // Get all drivers: current team drivers minus removed plus added
  const finalDrivers = [
    ...cachedJsonData.CurrentTeam.drivers.filter(
      (driver) => !changesToTeam.driversToRemove.includes(driver)
    ),
    ...changesToTeam.driversToAdd,
  ];

  // Get all constructors: current team constructors minus removed plus added
  const finalConstructors = [
    ...cachedJsonData.CurrentTeam.constructors.filter(
      (constructor) => !changesToTeam.constructorsToRemove.includes(constructor)
    ),
    ...changesToTeam.constructorsToAdd,
  ];

  const processedDrivers = finalDrivers.map((driverName) => {
    const driverData = cachedJsonData.Drivers[driverName];
    let displayName = driverData.DR;
    let points = parseFloat(driverData.expectedPoints);
    let isNew = changesToTeam.driversToAdd.includes(driverName);

    if (driverName === changesToTeam.extraDrsDriver) {
      displayName += ' (Extra DRS)';
      points *= 3;
    } else if (driverName === changesToTeam.newDRS) {
      displayName += ' (DRS)';
      isNew = true;
      points *= 2;
    } else if (
      driverName === cachedJsonData.CurrentTeam.drsBoost &&
      !changesToTeam.newDRS
    ) {
      displayName += ' (DRS)';
      points *= 2;
    }

    return {
      name: driverName,
      displayName,
      points,
      priceChange: parseFloat(driverData.expectedPriceChange),
      isNew,
    };
  });

  const processedConstructors = finalConstructors.map((constructorName) => {
    const constructorData = cachedJsonData.Constructors[constructorName];
    const displayName = constructorData.CN;
    const points = parseFloat(constructorData.expectedPoints);
    const isNew = changesToTeam.constructorsToAdd.includes(constructorName);

    return {
      name: constructorName,
      displayName,
      points,
      priceChange: parseFloat(constructorData.expectedPriceChange),
      isNew,
    };
  });

  processedDrivers.sort((a, b) => b.points - a.points);
  processedConstructors.sort((a, b) => b.points - a.points);

  let message = '\n\n*Drivers:*\n';
  processedDrivers.forEach((driver) => {
    message += `${driver.displayName}: ${driver.points.toFixed(
      2
    )} (${driver.priceChange.toFixed(2)}M)`;

    if (driver.isNew) {
      message += ' (New)';
    }
    message += '\n';
  });

  message += '\n*Constructors:*\n';
  processedConstructors.forEach((constructor) => {
    message += `${constructor.displayName}: ${constructor.points.toFixed(
      2
    )} (${constructor.priceChange.toFixed(2)}M)`;

    if (constructor.isNew) {
      message += ' (New)';
    }
    message += '\n';
  });

  return message;
}
