const { calculateChangesToTeam } = require('../bestTeamsCalculator');
const { updateUserAttributes } = require('../userRegistryService');
const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  selectedChipCache,
  sharedKey,
  resolveSelectedTeam,
  getBestTeamBudgetChangePointsPerMillion,
  remainingRaceCountCache,
  setSelectedBestTeam,
  serializeSelectedBestTeamByTeam,
} = require('../cache');
const { COMMAND_BEST_TEAMS } = require('../constants');
const { t } = require('../i18n');

// Handles the case when the message text is a number
async function handleNumberMessage(bot, chatId, textTrimmed) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const teamRowRequested = parseInt(textTrimmed, 10);

  if (bestTeamsCache[chatId]?.[teamId]) {
    const currentTeam = bestTeamsCache[chatId][teamId].currentTeam;
    const selectedTeam = bestTeamsCache[chatId][teamId].bestTeams.find(
      (t) => t.row === teamRowRequested,
    );

    if (selectedTeam) {
      const selectedBestTeamByTeam = setSelectedBestTeam(
        chatId,
        teamId,
        getSelectedBestTeamSelection(selectedTeam),
      );
      await updateUserAttributes(chatId, {
        selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
          selectedBestTeamByTeam,
        ),
      });

      if (
        selectedTeam.transfers_needed === 0 &&
        !selectedTeam.extra_drs_driver // if the user uses the extra drs chip we need to show the changes
      ) {
        await bot
          .sendMessage(
            chatId,
            t('You are already at team {TEAM}. No changes needed.', chatId, {
              TEAM: teamRowRequested,
            }),
          )
          .catch((err) =>
            console.error('Error sending no changes message:', err),
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
        selectedChipCache[chatId]?.[teamId],
        getBestTeamBudgetChangePointsPerMillion(chatId, teamId),
        remainingRaceCountCache[sharedKey],
      );

      let changesToTeamMessage = getRequiredChangesMessage(
        teamRowRequested,
        changesToTeam,
        selectedChipCache[chatId]?.[teamId],
        chatId,
      );
      changesToTeamMessage += getSelectedTeamInfo(
        teamRowRequested,
        selectedTeam,
        changesToTeam,
        chatId,
        getBestTeamBudgetChangePointsPerMillion(chatId, teamId),
      );

      changesToTeamMessage += getDriverAndConstructorsDetailsMessage(
        cachedJsonData,
        changesToTeam,
        chatId,
      );

      await bot
        .sendMessage(chatId, changesToTeamMessage, { parse_mode: 'Markdown' })
        .catch((err) =>
          console.error('Error sending changes to team message:', err),
        );
    } else {
      await bot
        .sendMessage(
          chatId,
          t('No team found for number {NUM}.', chatId, {
            NUM: teamRowRequested,
          }),
        )
        .catch((err) =>
          console.error('Error sending team not found message:', err),
        );
    }
  } else {
    await bot
      .sendMessage(
        chatId,
        t(
          'No cached teams available. Please send full JSON data or images first and then run the {CMD} command.',
          chatId,
          { CMD: COMMAND_BEST_TEAMS },
        ),
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err),
      );
  }
}

module.exports = { handleNumberMessage };

function getSelectedBestTeamSelection(selectedTeam) {
  return {
    drivers: selectedTeam.drivers,
    constructors: selectedTeam.constructors,
    drsDriver: selectedTeam.drs_driver,
    ...(selectedTeam.extra_drs_driver
      ? { extraDrsDriver: selectedTeam.extra_drs_driver }
      : {}),
  };
}

function getRequiredChangesMessage(
  teamRowRequested,
  changesToTeam,
  selectedChip,
  chatId,
) {
  let message = `*${t('Team {NUM} Required Changes:', chatId, { NUM: teamRowRequested })}*\n`;
  if (changesToTeam.driversToAdd.length) {
    message += `*${t('Drivers To Add', chatId)}:* ${changesToTeam.driversToAdd.join(', ')}\n`;
  }

  if (changesToTeam.driversToRemove.length) {
    message += `*${t('Drivers To Remove', chatId)}:* ${changesToTeam.driversToRemove.join(
      ', ',
    )}\n`;
  }

  if (changesToTeam.constructorsToAdd.length) {
    message += `*${t('Constructors To Add', chatId)}:* ${changesToTeam.constructorsToAdd.join(
      ', ',
    )}\n`;
  }
  if (changesToTeam.constructorsToRemove.length) {
    message += `*${t('Constructors To Remove', chatId)}:* ${changesToTeam.constructorsToRemove.join(
      ', ',
    )}\n`;
  }

  if (changesToTeam.extraDrsDriver) {
    message += `*${t('Extra DRS Driver', chatId)}:* ${changesToTeam.extraDrsDriver}\n`;
  }

  if (changesToTeam.newDRS !== undefined) {
    message += `*${
      changesToTeam.extraDrsDriver ? '' : t('New ', chatId)
    }${t('DRS Driver', chatId)}:* ${changesToTeam.newDRS}\n`;
  }

  if (changesToTeam.chipToActivate !== undefined) {
    message += `*${t('Chip To Activate', chatId)}:* ${selectedChip.replace(/_/g, ' ')}\n`;
  }

  return message;
}

// eslint-disable-next-line max-params
function getSelectedTeamInfo(
  teamRowRequested,
  selectedTeam,
  changesToTeam,
  chatId,
  budgetChangePointsPerMillion,
) {
  let message = `\n*${t('Team {NUM} Info:', chatId, { NUM: teamRowRequested })}*\n`;
  message += `*${t('Projected Points', chatId)}:* ${selectedTeam.projected_points.toFixed(
    2,
  )}\n`;
  if (budgetChangePointsPerMillion > 0) {
    message += `*${t('Budget-Adjusted Points', chatId)}:* ${selectedTeam.budget_adjusted_points.toFixed(
      2,
    )}\n`;
  }
  message += `*${t('Expected Price Change', chatId)}:* ${selectedTeam.expected_price_change.toFixed(
    2,
  )}M\n`;

  if (changesToTeam.deltaPoints !== undefined) {
    message += `*${t('Δ Points', chatId)}:* ${
      changesToTeam.deltaPoints > 0 ? '+' : ''
    }${changesToTeam.deltaPoints.toFixed(2)}\n`;
  }
  if (
    budgetChangePointsPerMillion > 0 &&
    changesToTeam.deltaBudgetAdjustedPoints !== undefined
  ) {
    message += `*${t('Δ Budget-Adjusted Points', chatId)}:* ${
      changesToTeam.deltaBudgetAdjustedPoints > 0 ? '+' : ''
    }${changesToTeam.deltaBudgetAdjustedPoints.toFixed(2)}\n`;
  }
  if (changesToTeam.deltaPrice !== undefined) {
    message += `*${t('Δ Price', chatId)}:* ${
      changesToTeam.deltaPrice > 0 ? '+' : ''
    }${changesToTeam.deltaPrice.toFixed(2)}M`;
  }

  return message;
}

function getDriverAndConstructorsDetailsMessage(
  cachedJsonData,
  changesToTeam,
  chatId,
) {
  // Get all drivers: current team drivers minus removed plus added
  const finalDrivers = [
    ...cachedJsonData.CurrentTeam.drivers.filter(
      (driver) => !changesToTeam.driversToRemove.includes(driver),
    ),
    ...changesToTeam.driversToAdd,
  ];

  // Get all constructors: current team constructors minus removed plus added
  const finalConstructors = [
    ...cachedJsonData.CurrentTeam.constructors.filter(
      (constructor) =>
        !changesToTeam.constructorsToRemove.includes(constructor),
    ),
    ...changesToTeam.constructorsToAdd,
  ];

  const processedDrivers = finalDrivers.map((driverName) => {
    const driverData = cachedJsonData.Drivers[driverName];
    let displayName = driverData.DR;
    let points = parseFloat(driverData.expectedPoints);
    let isNew = changesToTeam.driversToAdd.includes(driverName);

    if (driverName === changesToTeam.extraDrsDriver) {
      displayName += ` (${t('Extra DRS', chatId)})`;
      points *= 3;
    } else if (driverName === changesToTeam.newDRS) {
      displayName += ` (${t('DRS', chatId)})`;
      isNew = true;
      points *= 2;
    } else if (
      driverName === cachedJsonData.CurrentTeam.drsBoost &&
      !changesToTeam.newDRS
    ) {
      displayName += ` (${t('DRS', chatId)})`;
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

  let message = `\n\n*${t('Drivers', chatId)}:*\n`;
  processedDrivers.forEach((driver) => {
    message += `${driver.displayName}: ${driver.points.toFixed(
      2,
    )} (${driver.priceChange.toFixed(2)}M)`;

    if (driver.isNew) {
      message += ' 🆕';
    }
    message += '\n';
  });

  message += `\n*${t('Constructors', chatId)}:*\n`;
  processedConstructors.forEach((constructor) => {
    message += `${constructor.displayName}: ${constructor.points.toFixed(
      2,
    )} (${constructor.priceChange.toFixed(2)}M)`;

    if (constructor.isNew) {
      message += ' 🆕';
    }
    message += '\n';
  });

  return message;
}
