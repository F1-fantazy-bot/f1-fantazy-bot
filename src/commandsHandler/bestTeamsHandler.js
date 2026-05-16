const { validateJsonData } = require('../utils');
const {
  bestTeamsCache,
  currentTeamCache,
  resolveSelectedTeam,
  getDriversForChat,
  getConstructorsForChat,
} = require('../cache');
const { t } = require('../i18n');
const { computeBestTeams } = require('../cores/bestTeamsCore');

async function handleBestTeamsMessage(bot, chatId) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  // Try to fetch cached data for this chat
  const drivers = getDriversForChat(chatId);
  const constructors = getConstructorsForChat(chatId);
  const currentTeam = currentTeamCache[chatId]?.[teamId];

  if (!drivers || !constructors || !currentTeam) {
    await bot
      .sendMessage(
        chatId,
        t(
          'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
          chatId,
        ),
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err),
      );

    return;
  }

  // `validateJsonData` is intentionally side-effecty: it sends a user-facing
  // "Invalid JSON" message via `bot.sendMessage` when the cached data is
  // malformed. Keep calling it here so the Telegram surface keeps the same
  // observable behaviour. The agent's core does its own pure validation.
  if (
    !(await validateJsonData(
      bot,
      {
        Drivers: Object.values(drivers),
        Constructors: Object.values(constructors),
        CurrentTeam: currentTeam,
      },
      chatId,
    ))
  ) {
    return;
  }

  const result = await computeBestTeams({ chatId, teamId });
  if (result.status === 'missing_remaining_race_count') {
    await bot
      .sendMessage(
        chatId,
        t(
          'Remaining race count is unavailable right now. Switch to Pure Points or try again later.',
          chatId,
        ),
      )
      .catch((err) =>
        console.error(
          'Error sending remaining race count unavailable message:',
          err,
        ),
      );

    return;
  }

  // Any other non-ok status here would only fire if cache state changed
  // between our pre-checks above and the core's checks — defensive guard.
  if (result.status !== 'ok') {
    return;
  }

  const { bestTeams, budgetChangePointsPerMillion } = result;
  if (!bestTeamsCache[chatId]) {
    bestTeamsCache[chatId] = {};
  }
  bestTeamsCache[chatId][teamId] = {
    currentTeam,
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

      if (team.extra_boost_driver) {
        teamMarkdown += `*${t('Extra Boost Driver', chatId)}:* ${team.extra_boost_driver}\n`;
      }

      teamMarkdown +=
        `*${t('Boost Driver', chatId)}:* ${team.boost_driver}\n` +
        `*${t('Total Price', chatId)}:* ${Number(team.total_price.toFixed(2))}\n` +
        `*${t('Transfers Needed', chatId)}:* ${team.transfers_needed}\n` +
        `*${t('Penalty', chatId)}:* ${team.penalty}\n` +
        `*${t('Projected Points', chatId)}:* ${Number(team.projected_points.toFixed(2))}\n`;

      if (budgetChangePointsPerMillion > 0) {
        teamMarkdown += `*${t('Budget-Adjusted Points', chatId)}:* ${Number(
          team.budget_adjusted_points.toFixed(2),
        )}\n`;
      }

      teamMarkdown += `*${t('Expected Price Change', chatId)}:* ${Number(
        team.expected_price_change.toFixed(2),
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
      t(
        'Please send a number to get the required changes to that team.',
        chatId,
      ),
    )
    .catch((err) =>
      console.error('Error sending number request message:', err),
    );
}

module.exports = { handleBestTeamsMessage };
