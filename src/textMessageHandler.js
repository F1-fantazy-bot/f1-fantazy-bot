const { sendLogMessage } = require('./utils');
const { calculateBestTeams } = require('./bestTeamsCalculator');

exports.handleTextMessage = function (bot, msg) {
  const chatId = msg.chat.id;
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
  if (!jsonData.Drivers || jsonData.Drivers.length !== 20) {
    sendLogMessage(
      bot,
      `Invalid JSON data: ${msg.text}. Expected 20 drivers under "Drivers" property'.`
    );

    bot
      .sendMessage(
        chatId,
        'Invalid JSON data. Please ensure it contains 20 drivers under "Drivers" property.'
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return;
  }

  if (!jsonData.Constructors || jsonData.Constructors.length !== 10) {
    sendLogMessage(
      bot,
      `Invalid JSON data: ${msg.text}. Expected 10 constructors under "Constructors" property'.`
    );

    bot
      .sendMessage(
        chatId,
        'Invalid JSON data. Please ensure it contains 10 constructors under "Constructors" property.'
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return;
  }

  if (
    !jsonData.CurrentTeam ||
    !jsonData.CurrentTeam.drivers ||
    jsonData.CurrentTeam.drivers.length !== 5 ||
    !jsonData.CurrentTeam.constructors ||
    jsonData.CurrentTeam.constructors.length !== 2 ||
    !jsonData.CurrentTeam.drsBoost ||
    !jsonData.CurrentTeam.freeTransfers ||
    !jsonData.CurrentTeam.costCapRemaining
  ) {
    sendLogMessage(
      bot,
      `Invalid JSON data: ${msg.text}. Expected 5 drivers, 2 constructors, drsBoost, freeTransfers, and costCapRemaining properties under "CurrentTeam" property'.`
    );

    bot
      .sendMessage(
        chatId,
        'Invalid JSON data. Please ensure it contains the required properties under "CurrentTeam" property.'
      )
      .catch((err) => console.error('Error sending JSON error message:', err));

    return;
  }

  const bestTeams = calculateBestTeams(jsonData);

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
};
