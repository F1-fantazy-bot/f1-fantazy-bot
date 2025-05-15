const {
  sendLogMessage,
  validateJsonData,
  calculateTeamBudget,
  triggerScraping,
  isAdminMessage,
} = require('./utils');
const { readJsonFromStorage } = require('./readJsonFromStorage');
const {
  calculateBestTeams,
  calculateChangesToTeam,
} = require('./bestTeamsCalculator');
const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  currentTeamCache,
  getPrintableCache,
  selectedChipCache,
  simulationNameCache,
  sharedKey,
} = require('./cache');
const {
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_BUDGET,
  COMMAND_CHIPS,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
  COMMAND_TRIGGER_SCRAPING,
  COMMAND_LOAD_SIMULATION,
  COMMAND_GET_CURRENT_SIMULATION,
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
} = require('./constants');

exports.handleTextMessage = function (bot, msg) {
  const chatId = msg.chat.id;
  const textTrimmed = msg.text.trim();

  switch (true) {
    // Check if message text is a number and delegate to the number handler
    case /^\d+$/.test(textTrimmed):
      handleNumberMessage(bot, chatId, textTrimmed);

      return;
    case msg.text === COMMAND_BEST_TEAMS:
      handleBestTeamsMessage(bot, chatId);

      return;
    case msg.text === COMMAND_CURRENT_TEAM_BUDGET:
      return calcCurrentTeamBudget(bot, chatId);
    case msg.text === COMMAND_CHIPS:
      return handleChipsMessage(bot, msg);
    case msg.text === COMMAND_PRINT_CACHE:
      return sendPrintableCache(chatId, bot);
    case msg.text === COMMAND_RESET_CACHE:
      return resetCacheForChat(chatId, bot);
    case msg.text === COMMAND_LOAD_SIMULATION:
      return handleLoadSimulation(bot, msg);
    case msg.text === COMMAND_HELP:
      return displayHelpMessage(bot, msg);
    case msg.text === COMMAND_GET_CURRENT_SIMULATION:
      return handleGetCurrentSimulation(bot, msg);
    case msg.text === COMMAND_TRIGGER_SCRAPING:
      return handleScrapingTrigger(bot, msg);
    default:
      handleJsonMessage(bot, msg, chatId);
      break;
  }
};

// Handles the case when the message text is a number
function handleNumberMessage(bot, chatId, textTrimmed) {
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
        bot
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

      let changesToTeamMessage = `*Team ${teamRowRequested} Required Changes:*\n`;
      if (changesToTeam.driversToAdd.length) {
        changesToTeamMessage += `*Drivers To Add:* ${changesToTeam.driversToAdd.join(
          ', '
        )}\n`;
      }

      if (changesToTeam.driversToRemove.length) {
        changesToTeamMessage += `*Drivers To Remove:* ${changesToTeam.driversToRemove.join(
          ', '
        )}\n`;
      }

      if (changesToTeam.constructorsToAdd.length) {
        changesToTeamMessage += `*Constructors To Add:* ${changesToTeam.constructorsToAdd.join(
          ', '
        )}\n`;
      }
      if (changesToTeam.constructorsToRemove.length) {
        changesToTeamMessage += `*Constructors To Remove:* ${changesToTeam.constructorsToRemove.join(
          ', '
        )}\n`;
      }

      if (changesToTeam.extraDrsDriver) {
        changesToTeamMessage += `*Extra DRS Driver:* ${changesToTeam.extraDrsDriver}`;
      }

      if (changesToTeam.newDRS !== undefined) {
        changesToTeamMessage += `\n*${
          changesToTeam.extraDrsDriver ? '' : 'New '
        }DRS Driver:* ${changesToTeam.newDRS}`;
      }

      const selectedChip = selectedChipCache[chatId];
      if (changesToTeam.chipToActivate !== undefined) {
        changesToTeamMessage += `\n*Chip To Activate:* ${selectedChip.replace(
          /_/g,
          ' '
        )}`;
      }

      bot
        .sendMessage(chatId, changesToTeamMessage, { parse_mode: 'Markdown' })
        .catch((err) =>
          console.error('Error sending changes to team message:', err)
        );
    } else {
      bot
        .sendMessage(chatId, `No team found for number ${teamRowRequested}.`)
        .catch((err) =>
          console.error('Error sending team not found message:', err)
        );
    }
  } else {
    bot
      .sendMessage(
        chatId,
        `No cached teams available. Please send full JSON data or images first and then run the ${COMMAND_BEST_TEAMS} command.`
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );
  }
}

// Handles the case when the message text is JSON data
function handleJsonMessage(bot, msg, chatId) {
  let jsonData;
  try {
    jsonData = JSON.parse(msg.text);
  } catch (error) {
    sendLogMessage(
      bot,
      `Failed to parse JSON data: ${msg.text}. Error: ${error.message}`
    );
    bot
      .sendMessage(chatId, 'Invalid JSON format. Please send valid JSON.')
      .catch((err) => console.error('Error sending JSON error message:', err));

    return;
  }

  if (!validateJsonData(bot, jsonData, chatId)) {
    return;
  }

  driversCache[chatId] = Object.fromEntries(
    jsonData.Drivers.map((driver) => [driver.DR, driver])
  );
  constructorsCache[chatId] = Object.fromEntries(
    jsonData.Constructors.map((constructor) => [constructor.CN, constructor])
  );
  currentTeamCache[chatId] = jsonData.CurrentTeam;
  delete bestTeamsCache[chatId];

  sendPrintableCache(chatId, bot);
}

function handleBestTeamsMessage(bot, chatId) {
  // Try to fetch cached data for this chat
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    bot
      .sendMessage(
        chatId,
        'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );

    return;
  }

  // Build cachedJsonData object
  const cachedJsonData = {
    Drivers: drivers,
    Constructors: constructors,
    CurrentTeam: currentTeam,
  };

  if (
    !validateJsonData(
      bot,
      {
        Drivers: Object.values(drivers),
        Constructors: Object.values(constructors),
        CurrentTeam: currentTeam,
      },
      chatId
    )
  ) {
    return;
  }
  const bestTeams = calculateBestTeams(
    cachedJsonData,
    selectedChipCache[chatId]
  );
  bestTeamsCache[chatId] = {
    currentTeam: cachedJsonData.CurrentTeam,
    bestTeams,
  };

  // Create the Markdown message by mapping over the bestTeams array
  const messageMarkdown = bestTeams
    .map((team) => {
      // If drivers or constructors are arrays, join them into a readable string.
      const drivers = Array.isArray(team.drivers)
        ? team.drivers.join(', ')
        : team.drivers;
      const constructors = Array.isArray(team.constructors)
        ? team.constructors.join(', ')
        : team.constructors;

      let teamMarkdown =
        `*Team ${team.row}${
          team.transfers_needed === 0 ? ' (Current Team)' : ''
        }*\n` +
        `*Drivers:* ${drivers}\n` +
        `*Constructors:* ${constructors}\n`;

      if (team.extra_drs_driver) {
        teamMarkdown += `*Extra DRS Driver:* ${team.extra_drs_driver}\n`;
      }

      teamMarkdown +=
        `*DRS Driver:* ${team.drs_driver}\n` +
        `*Total Price:* ${Number(team.total_price.toFixed(2))}\n` +
        `*Transfers Needed:* ${team.transfers_needed}\n` +
        `*Penalty:* ${team.penalty}\n` +
        `*Projected Points:* ${Number(team.projected_points.toFixed(2))}\n` +
        `*Expected Price Change:* ${Number(
          team.expected_price_change.toFixed(2)
        )}`;

      return teamMarkdown;
    })
    .join('\n\n');

  bot
    .sendMessage(chatId, messageMarkdown, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending JSON reply:', err));

  bot
    .sendMessage(
      chatId,
      'Please send a number to get the required changes to that team.'
    )
    .catch((err) =>
      console.error('Error sending number request message:', err)
    );
}

function resetCacheForChat(chatId, bot) {
  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  bot
    .sendMessage(chatId, 'Cache has been reset for your chat.')
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

function sendPrintableCache(chatId, bot) {
  const printableCache = getPrintableCache(chatId);
  const selectedChip = selectedChipCache[chatId];

  if (printableCache) {
    bot
      .sendMessage(chatId, printableCache, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending drivers cache:', err));
  } else {
    bot
      .sendMessage(
        chatId,
        'Drivers cache is empty. Please send drivers image or valid JSON data.'
      )
      .catch((err) =>
        console.error('Error sending empty drivers cache message:', err)
      );
  }

  if (selectedChip) {
    bot
      .sendMessage(chatId, `Selected Chip: ${selectedChip}`)
      .catch((err) =>
        console.error('Error sending selected chip message:', err)
      );
  } else {
    bot
      .sendMessage(chatId, 'No chip selected.')
      .catch((err) => console.error('Error sending no chip message:', err));
  }

  return;
}

function calcCurrentTeamBudget(bot, chatId) {
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    bot
      .sendMessage(
        chatId,
        'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );

    return;
  }

  const teamBudget = calculateTeamBudget(currentTeam, drivers, constructors);

  const message =
    `*Current Team Budget Calculation:*\n` +
    `*Drivers & Constructors Total Price:* ${teamBudget.totalPrice.toFixed(
      2
    )}\n` +
    `*Cost Cap Remaining:* ${teamBudget.costCapRemaining.toFixed(2)}\n` +
    `*Total Budget:* ${teamBudget.overallBudget.toFixed(2)}`;

  bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team budget message:', err)
    );

  return;
}

function handleChipsMessage(bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Reply with inline buttons
  bot.sendMessage(chatId, 'which chip do you want to use?', {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Extra DRS',
            callback_data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
          },
          {
            text: 'Limitless',
            callback_data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
          },
          {
            text: 'Wildcard',
            callback_data: `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`,
          },
          {
            text: 'Without Chip',
            callback_data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
          },
        ],
      ],
    },
  });
}

function displayHelpMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);
  bot
    .sendMessage(
      chatId,
      `*Available Commands:*\n` +
        `${COMMAND_BEST_TEAMS.replace(
          /_/g,
          '\\_'
        )} - Calculate and display the best possible teams based on your cached data.\n` +
        `${COMMAND_CURRENT_TEAM_BUDGET.replace(
          /_/g,
          '\\_'
        )} - Calculate the current team budget based on your cached data.\n` +
        `${COMMAND_CHIPS.replace(
          /_/g,
          '\\_'
        )} - choose a chip to use for the current race.\n` +
        `${COMMAND_PRINT_CACHE.replace(
          /_/g,
          '\\_'
        )} - Show the currently cached drivers, constructors, and current team.\n` +
        `${COMMAND_RESET_CACHE.replace(
          /_/g,
          '\\_'
        )} - Clear all cached data for this chat.\n` +
        `${COMMAND_GET_CURRENT_SIMULATION.replace(
          /_/g,
          '\\_'
        )} - Show the current simulation data and name.\n` +
        `${COMMAND_HELP.replace(/_/g, '\\_')} - Show this help message.\n\n` +
        `${
          isAdmin
            ? '*Admin Commands:*\n' +
              `${COMMAND_TRIGGER_SCRAPING.replace(
                /_/g,
                '\\_'
              )} - Trigger web scraping for latest F1 Fantasy data.\n` +
              `${COMMAND_LOAD_SIMULATION.replace(
                /_/g,
                '\\_'
              )} - load latest simulation.\n\n`
            : ''
        }` +
        '*Other Messages:*\n' +
        '- Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.\n' +
        '- Send valid JSON data to update your drivers, constructors, and current team cache.\n' +
        `- Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using ${COMMAND_BEST_TEAMS.replace(
          /_/g,
          '\\_'
        )}).`,
      { parse_mode: 'Markdown' }
    )
    .catch((err) => console.error('Error sending help message:', err));

  return;
}

async function handleGetCurrentSimulation(bot, msg) {
  const chatId = msg.chat.id;
  const drivers = driversCache[chatId];
  const constructors = constructorsCache[chatId];

  // Check if user has data in their cache
  if (drivers || constructors) {
    await bot.sendMessage(
      chatId,
      `You currently have data in your cache. To use data from a simulation, please run ${COMMAND_RESET_CACHE} first.`
    );

    return;
  }

  const simulationName = simulationNameCache[sharedKey];
  if (!simulationName) {
    await bot.sendMessage(
      chatId,
      `No simulation data is currently loaded. Please use ${COMMAND_LOAD_SIMULATION} to load simulation data.`
    );

    return;
  }

  const printableCache = getPrintableCache(sharedKey);

  await bot.sendMessage(chatId, printableCache, { parse_mode: 'Markdown' });
  await bot.sendMessage(chatId, `Current simulation name: ${simulationName}`);

  if (isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      `💡 Tip: If the simulation seems outdated, you can run ${COMMAND_LOAD_SIMULATION} to update the current simulation.`
    );
  }

  return;
}

async function handleLoadSimulation(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    bot.sendMessage(chatId, 'Sorry, only admins can use this command.');

    return;
  }

  try {
    await readJsonFromStorage(bot);
    bot.sendMessage(chatId, 'JSON data fetched and cached successfully.');
  } catch (error) {
    bot.sendMessage(chatId, `Failed to fetch JSON data: ${error.message}`);
  }
}

async function handleScrapingTrigger(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    bot.sendMessage(chatId, 'Sorry, only admins can trigger scraping.');

    return;
  }

  const result = await triggerScraping(bot);
  if (result.success) {
    bot.sendMessage(chatId, 'Web scraping triggered successfully.');
  } else {
    bot.sendMessage(chatId, `Failed to trigger web scraping: ${result.error}`);
  }
}
