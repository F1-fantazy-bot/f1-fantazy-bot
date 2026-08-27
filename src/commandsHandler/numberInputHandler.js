const { calculateChangesToTeam } = require('../bestTeamsCalculator');
const {
  bestTeamsCache,
  selectedChipCache,
  sharedKey,
  resolveSelectedTeam,
  getBestTeamBudgetChangePointsPerMillion,
  remainingRaceCountCache,
  currentTeamCache,
  getSelectedTeam,
  getDriversForChat,
  getConstructorsForChat,
} = require('../cache');
const {
  setSelectedBestTeamPreference,
} = require('../services/selectedBestTeamService');
const {
  runChipMutation,
} = require('../services/activateChipService');
const { COMMAND_BEST_TEAMS } = require('../constants');
const { t } = require('../i18n');

// Handles the case when the message text is a number
async function handleNumberMessageInternal(
  bot,
  chatId,
  textTrimmed,
  transactionSnapshot,
) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const teamRowRequested = parseInt(textTrimmed, 10);
  const teamBestTeamsCache = transactionSnapshot.bestTeams;
  const chipAtCalculation = transactionSnapshot.chip;
  const currentChip = selectedChipCache[chatId]?.[teamId];
  const dependenciesMatch =
    teamId === transactionSnapshot.teamId &&
    chipAtCalculation === currentChip &&
    transactionSnapshot.ranking ===
      getBestTeamBudgetChangePointsPerMillion(chatId, teamId) &&
    transactionSnapshot.teamData ===
      JSON.stringify(currentTeamCache[chatId]?.[teamId] || null);

  if (teamBestTeamsCache && dependenciesMatch) {
    const currentTeam = teamBestTeamsCache.currentTeam;
    const selectedTeam = teamBestTeamsCache.bestTeams.find(
      (t) => t.row === teamRowRequested,
    );

    if (selectedTeam) {
      await setSelectedBestTeamPreference({
        chatId,
        teamId,
        selectedBestTeam: getSelectedBestTeamSelection(selectedTeam),
      });

      if (
        selectedTeam.transfers_needed === 0 &&
        !selectedTeam.extra_boost_driver // if the user uses the extra boost chip we need to show the changes
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
      const cachedJsonData =
        teamBestTeamsCache.calculationData ||
        {
          Drivers: getDriversForChat(chatId),
          Constructors: getConstructorsForChat(chatId),
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

async function handleNumberMessage(bot, chatId, textTrimmed) {
  const selectedTeam = getSelectedTeam(chatId);
  const cachedTeamIds = Object.keys(bestTeamsCache[chatId] || {});
  const teamId =
    selectedTeam && bestTeamsCache[chatId]?.[selectedTeam]
      ? selectedTeam
      : cachedTeamIds.length === 1
        ? cachedTeamIds[0]
        : null;
  const transactionSnapshot = {
    teamId,
    bestTeams: teamId ? bestTeamsCache[chatId]?.[teamId] : null,
    chip: teamId ? selectedChipCache[chatId]?.[teamId] : undefined,
    ranking: teamId
      ? getBestTeamBudgetChangePointsPerMillion(chatId, teamId)
      : null,
    teamData: teamId
      ? JSON.stringify(currentTeamCache[chatId]?.[teamId] || null)
      : null,
  };

  return await runChipMutation(chatId, () =>
    handleNumberMessageInternal(
      bot,
      chatId,
      textTrimmed,
      transactionSnapshot,
    ),
  );
}

function getSelectedBestTeamSelection(selectedTeam) {
  return {
    drivers: selectedTeam.drivers,
    constructors: selectedTeam.constructors,
    boostDriver: selectedTeam.boost_driver,
    ...(selectedTeam.extra_boost_driver
      ? { extraBoostDriver: selectedTeam.extra_boost_driver }
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

  if (changesToTeam.extraBoostDriver) {
    message += `*${t('Extra Boost Driver', chatId)}:* ${changesToTeam.extraBoostDriver}\n`;
  }

  if (changesToTeam.newBoost !== undefined) {
    message += `*${
      changesToTeam.extraBoostDriver ? '' : t('New ', chatId)
    }${t('Boost Driver', chatId)}:* ${changesToTeam.newBoost}\n`;
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
  const usesPlayerIds = Array.isArray(changesToTeam.driverKeysToAdd);
  const driversToRemove = usesPlayerIds
    ? changesToTeam.driverKeysToRemove
    : changesToTeam.driversToRemove;
  const driversToAdd = usesPlayerIds
    ? changesToTeam.driverKeysToAdd
    : changesToTeam.driversToAdd;

  // Get all drivers: current team drivers minus removed plus added
  const finalDrivers = [
    ...cachedJsonData.CurrentTeam.drivers.filter(
      (driver) => !driversToRemove.includes(driver),
    ),
    ...driversToAdd,
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
    let isNew = driversToAdd.includes(driverName);

    if (
      driverName ===
      (changesToTeam.extraBoostDriverKey || changesToTeam.extraBoostDriver)
    ) {
      displayName += ` (${t('Extra Boost', chatId)})`;
      points *= 3;
    } else if (
      driverName ===
      (changesToTeam.newBoostDriverKey || changesToTeam.newBoost)
    ) {
      displayName += ` (${t('Boost', chatId)})`;
      isNew = true;
      points *= 2;
    } else if (
      driverName === cachedJsonData.CurrentTeam.boost &&
      !changesToTeam.newBoost
    ) {
      displayName += ` (${t('Boost', chatId)})`;
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
