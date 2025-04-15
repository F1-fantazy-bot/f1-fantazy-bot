const { sendLogMessage, validateJsonData } = require('./utils');
const { calculateBestTeams, calculateChangesToTeam } = require('./bestTeamsCalculator');
const { bestTeamsCache, driversCache, constructorsCache, currentTeamCache, getPrintableCache } = require('./cache');
const {
    DRIVERS_PHOTO_TYPE,
    CONSTRUCTORS_PHOTO_TYPE,
    CURRENT_TEAM_PHOTO_TYPE
  } = require('./constants');

exports.handleTextMessage = function (bot, msg) {
    const chatId = msg.chat.id;
    const textTrimmed = msg.text.trim();
    
    // Check if message text is a number and delegate to the number handler
    if (/^\d+$/.test(textTrimmed)) {
        handleNumberMessage(bot, chatId, textTrimmed);
        return;
    }

    // Handle the "/best_teams" command
    if (msg.text === "/best_teams") {
        handleBestTeamsMessage(bot, chatId);
        return;
    }
  
    // Delegate to the JSON handler for any other case
    handleJsonMessage(bot, msg, chatId);
};

// Handles the case when the message text is a number
function handleNumberMessage(bot, chatId, textTrimmed) {
    const teamRowRequested = parseInt(textTrimmed, 10);

    if (bestTeamsCache[chatId]) {
        const currentTeam = bestTeamsCache[chatId].currentTeam;
        const selectedTeam = bestTeamsCache[chatId].bestTeams.find(t => t.row === teamRowRequested);

        if (selectedTeam) {
            const changesToTeam = calculateChangesToTeam(currentTeam, selectedTeam, teamRowRequested);

            let changesToTeamMessage = `*Team ${teamRowRequested} Required Changes:*\n` +
                `*Drivers To Add:* ${changesToTeam.driversToAdd}\n` +
                `*Drivers To Remove:* ${changesToTeam.driversToRemove}\n` +
                `*Constructors To Add:* ${changesToTeam.constructorsToAdd}\n` +
                `*Constructors To Remove:* ${changesToTeam.constructorsToRemove}`;

            if (changesToTeam.newDRS !== undefined) {
                changesToTeamMessage += `\n*New DRS Driver:* ${changesToTeam.newDRS}`;
            }

            bot
              .sendMessage(chatId, changesToTeamMessage, { parse_mode: 'Markdown' })
              .catch((err) => console.error('Error sending changes to team message:', err));
        } else {
            bot
              .sendMessage(chatId, `No team found for number ${teamRowRequested}.`)
              .catch((err) => console.error('Error sending team not found message:', err));
        }
    } else {
        bot
          .sendMessage(chatId, 'No cached teams available. Please send full JSON data first.')
          .catch((err) => console.error('Error sending cache unavailable message:', err));
    }
}

// Handles the case when the message text is JSON data
function handleJsonMessage(bot, msg, chatId) {
    let jsonData;
    try {
        jsonData = JSON.parse(msg.text);
    } catch (error) {
        sendLogMessage(bot, `Failed to parse JSON data: ${msg.text}. Error: ${error.message}`);
        bot
          .sendMessage(chatId, 'Invalid JSON format. Please send valid JSON.')
          .catch((err) => console.error('Error sending JSON error message:', err));
        return;
    }

    if (!validateJsonData(bot, jsonData, chatId)) {
        return;
    }

    driversCache[chatId] = Object.fromEntries(jsonData.Drivers.map(driver => [driver.DR, driver]));
    constructorsCache[chatId] = Object.fromEntries(jsonData.Constructors.map(constructor => [constructor.CN, constructor]));;
    currentTeamCache[chatId] = jsonData.CurrentTeam;

    const driversPrintable = getPrintableCache(chatId, DRIVERS_PHOTO_TYPE);
    const constructorsPrintable = getPrintableCache(chatId, CONSTRUCTORS_PHOTO_TYPE);
    const currentTeamPrintable = getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE);

    bot
        .sendMessage(chatId, driversPrintable, { parse_mode: 'Markdown' })
        .catch((err) => console.error('Error sending drivers cache:', err));
    bot
        .sendMessage(chatId, constructorsPrintable, { parse_mode: 'Markdown' })
        .catch((err) => console.error('Error sending constructors cache:', err));
    bot
        .sendMessage(chatId, currentTeamPrintable, { parse_mode: 'Markdown' })
        .catch((err) => console.error('Error sending current team cache:', err));
}

function handleBestTeamsMessage(bot, chatId)
{
    // Try to fetch cached data for this chat
    const drivers = driversCache[chatId];
    const constructors = constructorsCache[chatId];
    const currentTeam = currentTeamCache[chatId];

    if (!drivers || !constructors || !currentTeam) {
        bot
          .sendMessage(chatId, 'Missing cached data. Please send images containing drivers, constructors, and current team first.')
          .catch((err) => console.error('Error sending cache unavailable message:', err));
        return;
    }

    // Build jsonData object
    const jsonData = {
        Drivers: Object.values(drivers),
        Constructors: Object.values(constructors),
        CurrentTeam: currentTeam
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
                `*Expected Price Change:* ${Number(team.expected_price_change.toFixed(2))}`
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
      .catch((err) => console.error('Error sending number request message:', err));
}
