const { sendLogMessage, validateJsonData } = require('./utils');
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
} = require('./cache');
const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

// Command constants
const COMMAND_BEST_TEAMS = '/best_teams';
const COMMAND_CURRENT_TEAM_BUDGET = '/current_team_budget';
const COMMAND_PRINT_CACHE = '/print_cache';
const COMMAND_RESET_CACHE = '/reset_cache';
const COMMAND_HELP = '/help';

exports.handleTextMessage = function (bot, msg) {
  const chatId = msg.chat.id;
  const textTrimmed = msg.text.trim();

  // Check if message text is a number and delegate to the number handler
  if (/^\d+$/.test(textTrimmed)) {
    handleNumberMessage(bot, chatId, textTrimmed);
    return;
  }

  // Handle the "/best_teams" command
  if (msg.text === COMMAND_BEST_TEAMS) {
    handleBestTeamsMessage(bot, chatId);
    return;
  }

  // Handle the "/current_team_budget" command
  if (msg.text === COMMAND_CURRENT_TEAM_BUDGET) {
    return calcCurrentTeamBudget(bot, chatId);
  }

  // Handle the "/print_cache" command
  if (msg.text === COMMAND_PRINT_CACHE) {
    return sendPrintableCache(chatId, bot);
  }

  // Handle the "/reset_cache" command
  if (msg.text === COMMAND_RESET_CACHE) {
    return resetCacheForChat(chatId, bot);
  }

  // Handle the "/help" command
  if (msg.text === COMMAND_HELP) {
    return displayHelpMessage(bot, chatId);
  }

  // Delegate to the JSON handler for any other case
  handleJsonMessage(bot, msg, chatId);
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
      const changesToTeam = calculateChangesToTeam(
        currentTeam,
        selectedTeam,
        teamRowRequested
      );

      let changesToTeamMessage =
        `*Team ${teamRowRequested} Required Changes:*\n` +
        `*Drivers To Add:* ${changesToTeam.driversToAdd}\n` +
        `*Drivers To Remove:* ${changesToTeam.driversToRemove}\n` +
        `*Constructors To Add:* ${changesToTeam.constructorsToAdd}\n` +
        `*Constructors To Remove:* ${changesToTeam.constructorsToRemove}`;

      if (changesToTeam.newDRS !== undefined) {
        changesToTeamMessage += `\n*New DRS Driver:* ${changesToTeam.newDRS}`;
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
  const drivers = driversCache[chatId];
  const constructors = constructorsCache[chatId];
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

  // Build jsonData object
  const jsonData = {
    Drivers: Object.values(drivers),
    Constructors: Object.values(constructors),
    CurrentTeam: currentTeam,
  };

  if (!validateJsonData(bot, jsonData, chatId)) {
    return;
  }

  const bestTeams = calculateBestTeams(jsonData);
  bestTeamsCache[chatId] = { currentTeam: jsonData.CurrentTeam, bestTeams };

  // Create the Markdown message by mapping over the bestTeams array
  let messageMarkdown = bestTeams
    .map((team) => {
      // If drivers or constructors are arrays, join them into a readable string.
      const drivers = Array.isArray(team.drivers)
        ? team.drivers.join(', ')
        : team.drivers;
      const constructors = Array.isArray(team.constructors)
        ? team.constructors.join(', ')
        : team.constructors;

      return (
        `*Team ${team.row}*\n` +
        `*Drivers:* ${drivers}\n` +
        `*Constructors:* ${constructors}\n` +
        `*DRS Driver:* ${team.drs_driver}\n` +
        `*Total Price:* ${Number(team.total_price.toFixed(2))}\n` +
        `*Transfers Needed:* ${team.transfers_needed}\n` +
        `*Penalty:* ${team.penalty}\n` +
        `*Projected Points:* ${Number(team.projected_points.toFixed(2))}\n` +
        `*Expected Price Change:* ${Number(
          team.expected_price_change.toFixed(2)
        )}`
      );
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

  bot
    .sendMessage(chatId, 'Cache has been reset for your chat.')
    .catch((err) => console.error('Error sending cache reset message:', err));
  return;
}

function sendPrintableCache(chatId, bot) {
  const driversPrintable = getPrintableCache(chatId, DRIVERS_PHOTO_TYPE);
  const constructorsPrintable = getPrintableCache(
    chatId,
    CONSTRUCTORS_PHOTO_TYPE
  );
  const currentTeamPrintable = getPrintableCache(
    chatId,
    CURRENT_TEAM_PHOTO_TYPE
  );

  if (driversPrintable) {
    bot
      .sendMessage(chatId, driversPrintable, { parse_mode: 'Markdown' })
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

  if (constructorsPrintable) {
    bot
      .sendMessage(chatId, constructorsPrintable, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending constructors cache:', err));
  } else {
    bot
      .sendMessage(
        chatId,
        'Constructors cache is empty. Please send constructors image or valid JSON data.'
      )
      .catch((err) =>
        console.error('Error sending empty constructors cache message:', err)
      );
  }

  if (currentTeamPrintable) {
    bot
      .sendMessage(chatId, currentTeamPrintable, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending current team cache:', err));
  } else {
    bot
      .sendMessage(
        chatId,
        'Current team cache is empty. Please send current team image or valid JSON data.'
      )
      .catch((err) =>
        console.error('Error sending empty current team cache message:', err)
      );
  }

  return;
}

function calcCurrentTeamBudget(bot, chatId) {
  const drivers = driversCache[chatId];
  const constructors = constructorsCache[chatId];
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

  let totalPrice = 0;

  // Sum driver prices
  for (const dr of currentTeam.drivers) {
    totalPrice += drivers[dr].price;
  }

  // Sum constructor prices
  for (const cn of currentTeam.constructors) {
    totalPrice += constructors[cn].price;
  }

  // Add cost remaining
  const costCapRemaining = currentTeam.costCapRemaining;
  const teamBudget = totalPrice + costCapRemaining;

  let message =
    `*Current Team Budget Calculation:*\n` +
    `*Drivers & Constructors Total Price:* ${totalPrice.toFixed(2)}\n` +
    `*Cost Cap Remaining:* ${costCapRemaining.toFixed(2)}\n` +
    `*Total Budget:* ${teamBudget.toFixed(2)}`;

  bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team budget message:', err)
    );

  return;
}

function displayHelpMessage(bot, chatId) {
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
        `${COMMAND_PRINT_CACHE.replace(
          /_/g,
          '\\_'
        )} - Show the currently cached drivers, constructors, and current team.\n` +
        `${COMMAND_RESET_CACHE.replace(
          /_/g,
          '\\_'
        )} - Clear all cached data for this chat.\n` +
        `${COMMAND_HELP.replace(/_/g, '\\_')} - Show this help message.\n\n` +
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
