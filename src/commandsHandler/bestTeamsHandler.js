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
const { sendMessageToUser } = require('../utils');

async function handleBestTeamsMessage(bot, chatId) {
  // Try to fetch cached data for this chat
  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors =
    constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId];

  if (!drivers || !constructors || !currentTeam) {
    await sendMessageToUser(
      bot,
      chatId,
      t('Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.', chatId)
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

      const titleKey =
        team.transfers_needed === 0
          ? 'Team {NUM} (Current Team)'
          : 'Team {NUM}';
      let teamMarkdown =
        `*${t(titleKey, chatId, { NUM: team.row })}*\n` +
        `*${t('Drivers', chatId)}:* ${drivers}\n` +
        `*${t('Constructors', chatId)}:* ${constructors}\n`;

      if (team.extra_drs_driver) {
        teamMarkdown += `*${t('Extra DRS Driver', chatId)}:* ${team.extra_drs_driver}\n`;
      }

      teamMarkdown +=
        `*${t('DRS Driver', chatId)}:* ${team.drs_driver}\n` +
        `*${t('Total Price', chatId)}:* ${Number(team.total_price.toFixed(2))}\n` +
        `*${t('Transfers Needed', chatId)}:* ${team.transfers_needed}\n` +
        `*${t('Penalty', chatId)}:* ${team.penalty}\n` +
        `*${t('Projected Points', chatId)}:* ${Number(team.projected_points.toFixed(2))}\n` +
        `*${t('Expected Price Change', chatId)}:* ${Number(
          team.expected_price_change.toFixed(2)
        )}`;

      return teamMarkdown;
    })
    .join('\n\n');

  await sendMessageToUser(bot, chatId, messageMarkdown, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending JSON reply:', err));

  await sendMessageToUser(
    bot,
    chatId,
    t('Please send a number to get the required changes to that team.', chatId)
  )
    .catch((err) =>
      console.error('Error sending number request message:', err)
    );
}

module.exports = { handleBestTeamsMessage };
