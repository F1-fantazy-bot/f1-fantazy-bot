const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { getSelectedTeam } = require('../cache');
const {
  LEAGUE_CALLBACK_TYPE,
  COMMAND_FOLLOW_LEAGUE,
} = require('../constants');

function sanitizeTeamName(name) {
  const base = String(name || 'team')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = base.length > 0 ? base : 'team';

  return trimmed.slice(0, 40);
}

function buildTeamId(leagueCode, teamName) {
  return `${leagueCode}_${sanitizeTeamName(teamName)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
  const selectedTeamId = getSelectedTeam(chatId);

  const header =
    `🏆 ${escapeHtml(leagueData.leagueName || leagueData.leagueCode)}\n` +
    t('👥 {COUNT} teams · updated {TIME}', chatId, {
      COUNT: String(leagueData.memberCount ?? teams.length),
      TIME: escapeHtml(leagueData.fetchedAt || ''),
    });

  if (teams.length === 0) {
    return `${header}\n\n${t('No teams in this league yet.', chatId)}`;
  }

  const maxPos = teams[teams.length - 1].position ?? teams.length;
  const posWidth = String(maxPos).length;
  const lines = teams.map((team) => {
    const pos = String(team.position ?? '?').padStart(posWidth, ' ');
    const name = escapeHtml(team.teamName || team.userName || '—');
    const score = team.totalScore ?? 0;
    const line = ` ${pos}. ${name} — ${escapeHtml(score)}`;
    const teamId = buildTeamId(
      leagueData.leagueCode,
      team.teamName || team.userName || 'team',
    );

    return teamId === selectedTeamId ? `<b>${line}</b>` : line;
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

  await bot.sendMessage(chatId, formatLeaderboard(leagueData, chatId), {
    parse_mode: 'HTML',
  });
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
        'You are not following any league. Run {CMD} to follow one first.',
        chatId,
        { CMD: COMMAND_FOLLOW_LEAGUE },
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
