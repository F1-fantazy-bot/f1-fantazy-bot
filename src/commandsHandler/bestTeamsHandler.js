const { validateJsonData } = require('../utils');
const { calculateBestTeams } = require('../bestTeamsCalculator');
const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
} = require('../cache');
const { t } = require('../i18n');

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
        t('Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.')
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
      t('Please send a number to get the required changes to that team.')
    )
    .catch((err) =>
      console.error('Error sending number request message:', err)
    );
}

module.exports = { handleBestTeamsMessage };
