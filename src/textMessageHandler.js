const {
  sendLogMessage,
  validateJsonData,
  calculateTeamInfo,
  triggerScraping,
  isAdminMessage,
} = require('./utils');
const azureStorageService = require('./azureStorageService');
const { formatSessionDateTime } = require('./utils/utils');
const { getWeatherForecast } = require('./utils/weatherApi');
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
  nextRaceInfoCache,
  sharedKey,
  weatherForecastCache,
} = require('./cache');
const {
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO,
  COMMAND_CHIPS,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
  COMMAND_TRIGGER_SCRAPING,
  COMMAND_LOAD_SIMULATION,
  COMMAND_GET_CURRENT_SIMULATION,
  COMMAND_GET_BOTFATHER_COMMANDS,
  COMMAND_NEXT_RACE_INFO,
  USER_COMMANDS_CONFIG,
  ADMIN_COMMANDS_CONFIG,
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
} = require('./constants');

exports.handleTextMessage = async function (bot, msg) {
  const chatId = msg.chat.id;
  const textTrimmed = msg.text.trim();

  switch (true) {
    // Check if message text is a number and delegate to the number handler
    case /^\d+$/.test(textTrimmed):
      await handleNumberMessage(bot, chatId, textTrimmed);

      return;
    case msg.text === COMMAND_BEST_TEAMS:
      await handleBestTeamsMessage(bot, chatId);

      return;
    case msg.text === COMMAND_CURRENT_TEAM_INFO:
      return await calcCurrentTeamInfo(bot, chatId);
    case msg.text === COMMAND_CHIPS:
      return await handleChipsMessage(bot, msg);
    case msg.text === COMMAND_PRINT_CACHE:
      return await sendPrintableCache(chatId, bot);
    case msg.text === COMMAND_RESET_CACHE:
      return await resetCacheForChat(chatId, bot);
    case msg.text === COMMAND_LOAD_SIMULATION:
      return await handleLoadSimulation(bot, msg);
    case msg.text === COMMAND_HELP:
      return await displayHelpMessage(bot, msg);
    case msg.text === COMMAND_GET_CURRENT_SIMULATION:
      return await handleGetCurrentSimulation(bot, msg);
    case msg.text === COMMAND_TRIGGER_SCRAPING:
      return await handleScrapingTrigger(bot, msg);
    case msg.text === COMMAND_GET_BOTFATHER_COMMANDS:
      return await handleGetBotfatherCommands(bot, msg);
    case msg.text === COMMAND_NEXT_RACE_INFO:
      return await handleNextRaceInfoCommand(bot, chatId);
    default:
      handleJsonMessage(bot, msg, chatId);
      break;
  }
};

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
        changesToTeamMessage += `*Extra DRS Driver:* ${changesToTeam.extraDrsDriver}\n`;
      }

      if (changesToTeam.newDRS !== undefined) {
        changesToTeamMessage += `*${
          changesToTeam.extraDrsDriver ? '' : 'New '
        }DRS Driver:* ${changesToTeam.newDRS}\n`;
      }

      const selectedChip = selectedChipCache[chatId];
      if (changesToTeam.chipToActivate !== undefined) {
        changesToTeamMessage += `*Chip To Activate:* ${selectedChip.replace(
          /_/g,
          ' '
        )}\n`;
      }

      if (changesToTeam.deltaPoints !== undefined) {
        changesToTeamMessage += `*Δ Points:* ${
          changesToTeam.deltaPoints > 0 ? '+' : ''
        }${changesToTeam.deltaPoints.toFixed(2)}\n`;
      }
      if (changesToTeam.deltaPrice !== undefined) {
        changesToTeamMessage += `*Δ Price:* ${
          changesToTeam.deltaPrice > 0 ? '+' : ''
        }${changesToTeam.deltaPrice.toFixed(2)}M`;
      }

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

// Handles the case when the message text is JSON data
async function handleJsonMessage(bot, msg, chatId) {
  let jsonData;
  try {
    jsonData = JSON.parse(msg.text);
  } catch (error) {
    await sendLogMessage(
      bot,
      `Failed to parse JSON data: ${msg.text}. Error: ${error.message}`
    );
    await bot
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
  await azureStorageService.saveUserTeam(bot, chatId, jsonData.CurrentTeam);
  delete bestTeamsCache[chatId];

  await sendPrintableCache(chatId, bot);
}

async function handleBestTeamsMessage(bot, chatId) {
  // Try to fetch cached data for this chat
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    await bot
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

  await bot
    .sendMessage(chatId, messageMarkdown, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending JSON reply:', err));

  await bot
    .sendMessage(
      chatId,
      'Please send a number to get the required changes to that team.'
    )
    .catch((err) =>
      console.error('Error sending number request message:', err)
    );
}

async function resetCacheForChat(chatId, bot) {
  delete driversCache[chatId];
  delete constructorsCache[chatId];
  delete currentTeamCache[chatId];
  await azureStorageService.deleteUserTeam(bot, chatId);
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  await bot
    .sendMessage(chatId, 'Cache has been reset for your chat.')
    .catch((err) => console.error('Error sending cache reset message:', err));

  return;
}

async function sendPrintableCache(chatId, bot) {
  const printableCache = getPrintableCache(chatId);
  const selectedChip = selectedChipCache[chatId];

  if (printableCache) {
    await bot
      .sendMessage(chatId, printableCache, { parse_mode: 'Markdown' })
      .catch((err) => console.error('Error sending drivers cache:', err));
  } else {
    await bot
      .sendMessage(
        chatId,
        'Drivers cache is empty. Please send drivers image or valid JSON data.'
      )
      .catch((err) =>
        console.error('Error sending empty drivers cache message:', err)
      );
  }

  if (selectedChip) {
    await bot
      .sendMessage(chatId, `Selected Chip: ${selectedChip}`)
      .catch((err) =>
        console.error('Error sending selected chip message:', err)
      );
  } else {
    await bot
      .sendMessage(chatId, 'No chip selected.')
      .catch((err) => console.error('Error sending no chip message:', err));
  }

  return;
}

async function calcCurrentTeamInfo(bot, chatId) {
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    await bot
      .sendMessage(
        chatId,
        'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );

    return;
  }

  const teamInfo = calculateTeamInfo(currentTeam, drivers, constructors);

  const message =
    `*Current Team Info:*\n` +
    `*Drivers & Constructors Total Price:* ${teamInfo.totalPrice.toFixed(
      2
    )}\n` +
    `*Cost Cap Remaining:* ${teamInfo.costCapRemaining.toFixed(2)}\n` +
    `*Total Budget:* ${teamInfo.overallBudget.toFixed(2)}\n` +
    `*Expected Points:* ${teamInfo.teamExpectedPoints.toFixed(2)}\n` +
    `*Expected Price Change:* ${teamInfo.teamPriceChange.toFixed(2)}`;

  await bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending current team info message:', err)
    );

  return;
}

async function handleChipsMessage(bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Reply with inline buttons
  await bot.sendMessage(chatId, 'which chip do you want to use?', {
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

async function displayHelpMessage(bot, msg) {
  const chatId = msg.chat.id;
  const isAdmin = isAdminMessage(msg);

  let helpMessage = '*Available Commands:*\n';
  USER_COMMANDS_CONFIG.forEach((cmd) => {
    helpMessage += `${cmd.constant.replace(/_/g, '\\_')} - ${
      cmd.description
    }\n`;
  });
  helpMessage += '\n';

  if (isAdmin) {
    helpMessage += '*Admin Commands:*\n';
    ADMIN_COMMANDS_CONFIG.forEach((cmd) => {
      helpMessage += `${cmd.constant.replace(/_/g, '\\_')} - ${
        cmd.description
      }\n`;
    });
    helpMessage += '\n';
  }

  helpMessage +=
    '*Other Messages:*\n' +
    '- Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.\n' +
    '- Send valid JSON data to update your drivers, constructors, and current team cache.\n' +
    `- Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using ${COMMAND_BEST_TEAMS.replace(
      /_/g,
      '\\_'
    )}).`;

  await bot
    .sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
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
    await bot.sendMessage(chatId, 'Sorry, only admins can use this command.');

    return;
  }

  try {
    await readJsonFromStorage(bot);
    await bot.sendMessage(chatId, 'JSON data fetched and cached successfully.');
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `Failed to fetch JSON data: ${error.message}`
    );
  }
}

async function handleScrapingTrigger(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, 'Sorry, only admins can trigger scraping.');

    return;
  }

  const result = await triggerScraping(bot);
  if (result.success) {
    await bot.sendMessage(chatId, 'Web scraping triggered successfully.');
  } else {
    await bot.sendMessage(
      chatId,
      `Failed to trigger web scraping: ${result.error}`
    );
  }
}

async function handleGetBotfatherCommands(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      'Sorry, only admins can get BotFather commands.'
    );

    return;
  }

  const botFatherCommands = USER_COMMANDS_CONFIG.map(
    (cmd) => `${cmd.constant.substring(1)} - ${cmd.description}`
  ).join('\n');

  await bot
    .sendMessage(chatId, botFatherCommands)
    .catch((err) =>
      console.error('Error sending BotFather commands message:', err)
    );
}

async function handleNextRaceInfoCommand(bot, chatId) {
  const nextRaceInfo = nextRaceInfoCache[sharedKey];

  if (!nextRaceInfo) {
    await bot
      .sendMessage(chatId, 'Next race information is currently unavailable.')
      .catch((err) =>
        console.error('Error sending next race info unavailable message:', err)
      );

    return;
  }
  // Prepare session dates
  const raceDate = new Date(nextRaceInfo.sessions.race);
  const qualifyingDate = new Date(nextRaceInfo.sessions.qualifying);
  const isSprintWeekend = nextRaceInfo.weekendFormat === 'sprint';

  // If sprint weekend, get sprint session dates
  let sprintQualifyingDate = null;
  let sprintDate = null;
  if (isSprintWeekend) {
    sprintQualifyingDate = new Date(nextRaceInfo.sessions.sprintQualifying);
    sprintDate = new Date(nextRaceInfo.sessions.sprint);
  }

  // Format session dates and times
  const { dateStr: qualifyingDateStr, timeStr: qualifyingTimeStr } =
    formatSessionDateTime(qualifyingDate);
  const { dateStr: raceDateStr, timeStr: raceTimeStr } =
    formatSessionDateTime(raceDate);

  let sprintQualifyingDateStr = '',
    sprintQualifyingTimeStr = '';
  let sprintDateStr = '',
    sprintTimeStr = '';
  if (isSprintWeekend) {
    ({ dateStr: sprintQualifyingDateStr, timeStr: sprintQualifyingTimeStr } =
      formatSessionDateTime(sprintQualifyingDate));

    ({ dateStr: sprintDateStr, timeStr: sprintTimeStr } =
      formatSessionDateTime(sprintDate));
  }

  // Prepare array of dates for weather API
  const datesForWeatherApi = [];
  datesForWeatherApi.push(qualifyingDate, raceDate);
  if (isSprintWeekend) {
    datesForWeatherApi.push(sprintQualifyingDate, sprintDate);
  }

  // Weather forecast section
  let weatherSection = '';
  let sprintQualifyingWeather, sprintWeather, qualifyingWeather, raceWeather;
  const cachedWeatherData = weatherForecastCache;
  if (cachedWeatherData && Object.keys(cachedWeatherData).length > 0) {
    qualifyingWeather = cachedWeatherData.qualifyingWeather;
    raceWeather = cachedWeatherData.raceWeather;
    if (isSprintWeekend) {
      sprintQualifyingWeather = cachedWeatherData.sprintQualifyingWeather;
      sprintWeather = cachedWeatherData.sprintWeather;
    }
  } else {
    try {
      const weatherForecastsMap = await getWeatherForecast(
        nextRaceInfo.location.lat,
        nextRaceInfo.location.long,
        ...datesForWeatherApi
      );
      qualifyingWeather = weatherForecastsMap[qualifyingDate.toISOString()];
      raceWeather = weatherForecastsMap[raceDate.toISOString()];
      weatherForecastCache.qualifyingWeather = qualifyingWeather;
      weatherForecastCache.raceWeather = raceWeather;

      if (isSprintWeekend) {
        sprintQualifyingWeather =
          weatherForecastsMap[sprintQualifyingDate.toISOString()];
        sprintWeather = weatherForecastsMap[sprintDate.toISOString()];
        weatherForecastCache.sprintQualifyingWeather = sprintQualifyingWeather;
        weatherForecastCache.sprintWeather = sprintWeather;
      }

      await sendLogMessage(
        bot,
        `Weather forecast fetched for location: ${nextRaceInfo.location.locality}, ${nextRaceInfo.location.country}`
      );
    } catch (err) {
      await sendLogMessage(bot, `Weather API error: ${err.message}`);
    }
  }

  // Build weather section
  if (qualifyingWeather && raceWeather) {
    weatherSection += '*Weather Forecast:*\n';
    if (isSprintWeekend) {
      weatherSection += `*Sprint Qualifying:*\n🌡️ Temp: ${sprintQualifyingWeather.temperature}°C\n🌧️ Rain: ${sprintQualifyingWeather.precipitation}%\n💨 Wind: ${sprintQualifyingWeather.wind} km/h\n`;
      weatherSection += `*Sprint:*\n🌡️ Temp: ${sprintWeather.temperature}°C\n🌧️ Rain: ${sprintWeather.precipitation}%\n💨 Wind: ${sprintWeather.wind} km/h\n`;
    }
    weatherSection += `*Qualifying:*\n🌡️ Temp: ${qualifyingWeather.temperature}°C\n🌧️ Rain: ${qualifyingWeather.precipitation}%\n💨 Wind: ${qualifyingWeather.wind} km/h\n`;
    weatherSection += `*Race:*\n🌡️ Temp: ${raceWeather.temperature}°C\n🌧️ Rain: ${raceWeather.precipitation}%\n💨 Wind: ${raceWeather.wind} km/h\n\n`;
  }

  // Create message with next race information
  let message = `*Next Race Information*\n\n`;
  message += `🏁 *Track:* ${nextRaceInfo.circuitName}\n`;
  message += `📍 *Location:* ${nextRaceInfo.location.locality}, ${nextRaceInfo.location.country}\n`;
  if (isSprintWeekend) {
    message += `📅 *Sprint Qualifying Date:* ${sprintQualifyingDateStr}\n`;
    message += `⏰ *Sprint Qualifying Time:* ${sprintQualifyingTimeStr}\n`;
    message += `📅 *Sprint Date:* ${sprintDateStr}\n`;
    message += `⏰ *Sprint Time:* ${sprintTimeStr}\n`;
  }
  message += `📅 *Qualifying Date:* ${qualifyingDateStr}\n`;
  message += `⏰ *Qualifying Time:* ${qualifyingTimeStr}\n`;
  message += `📅 *Race Date:* ${raceDateStr}\n`;
  message += `⏰ *Race Time:* ${raceTimeStr}\n`;
  message += `📝 *Weekend Format:* ${
    nextRaceInfo.weekendFormat.charAt(0).toUpperCase() +
    nextRaceInfo.weekendFormat.slice(1)
  }\n\n`;
  message += weatherSection;

  // Add historical data section
  message += '*Historical Data (Last Decade):*\n';
  if (nextRaceInfo.historicalData && nextRaceInfo.historicalData.length > 0) {
    nextRaceInfo.historicalData
      .sort((a, b) => b.season - a.season)
      .forEach((data) => {
        message += `*${data.season}:*\n`;
        message += `🏆 Winner: ${data.winner}\n`;
        message += `🏎️ Cars Finished: ${data.carsFinished}\n\n`;
      });
  } else {
    message += 'No historical data available for this track.\n';
  }

  await bot
    .sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .catch((err) =>
      console.error('Error sending next race info message:', err)
    );
}
