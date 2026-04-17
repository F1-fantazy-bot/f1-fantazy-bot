const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const {
  LEAGUE_CALLBACK_TYPE,
  COMMAND_REGISTER_LEAGUE,
} = require('../constants');

/**
 * Render a compact leaderboard message from the blob payload.
 * Format: header with league name + member count + fetchedAt,
 * followed by `position. teamName — totalScore` lines sorted by position.
 * @param {Object} leagueData
 * @param {number|string} chatId
 * @returns {string}
 */
function formatLeaderboard(leagueData, chatId) {
  const teams = Array.isArray(leagueData.teams) ? [...leagueData.teams] : [];
  teams.sort((a, b) => (a.position || 0) - (b.position || 0));

  const header =
    `🏆 ${leagueData.leagueName || leagueData.leagueCode}\n` +
    t('👥 {COUNT} teams · updated {TIME}', chatId, {
      COUNT: String(leagueData.memberCount ?? teams.length),
      TIME: leagueData.fetchedAt || '',
    });

  if (teams.length === 0) {
    return `${header}\n\n${t('No teams in this league yet.', chatId)}`;
  }

  const maxPos = teams[teams.length - 1].position ?? teams.length;
  const posWidth = String(maxPos).length;
  const lines = teams.map((team) => {
    const pos = String(team.position ?? '?').padStart(posWidth, ' ');
    const name = team.teamName || team.userName || '—';
    const score = team.totalScore ?? 0;

    return ` ${pos}. ${name} — ${score}`;
  });

  return `${header}\n\n${lines.join('\n')}`;
}

async function sendLeaderboard(bot, chatId, leagueCode) {
  let leagueData;
  try {
    leagueData = await getLeagueData(leagueCode);
  } catch (err) {
    console.error('Error fetching league data for leaderboard:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!leagueData) {
    await bot.sendMessage(
      chatId,
      t(
        'No leaderboard data is available yet for this league. Please try again later.',
        chatId,
      ),
    );

    return;
  }

  await bot.sendMessage(chatId, formatLeaderboard(leagueData, chatId));
}

async function handleLeaderboardCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  let leagues;
  try {
    leagues = await listUserLeagues(chatId);
  } catch (err) {
    console.error('Error listing user leagues:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load your leagues: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!leagues || leagues.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'You are not registered to any league. Run {CMD} to register to one first.',
        chatId,
        { CMD: COMMAND_REGISTER_LEAGUE },
      ),
    );

    return;
  }

  if (leagues.length === 1) {
    await sendLeaderboard(bot, chatId, leagues[0].leagueCode);

    return;
  }

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: `${LEAGUE_CALLBACK_TYPE}:${league.leagueCode}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league leaderboard do you want to see?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

module.exports = {
  handleLeaderboardCommand,
  formatLeaderboard,
  sendLeaderboard,
};
