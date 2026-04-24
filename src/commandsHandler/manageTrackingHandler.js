const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getUserLeagueTeamIds } = require('../cache');
const { buildTeamId } = require('../utils/teamId');
const {
  COMMAND_FOLLOW_LEAGUE,
  MANAGE_TRACKING_LEAGUE_CALLBACK_TYPE,
  MANAGE_TRACKING_TOGGLE_CALLBACK_TYPE,
  MANAGE_TRACKING_BACK_CALLBACK_TYPE,
} = require('../constants');
const { loadLeagueTeamsData } = require('./selectTeamFromLeagueHandler');

function sortTeamsByPosition(teams) {
  return [...teams].sort((a, b) => (a.position || 0) - (b.position || 0));
}

async function buildManageTrackingTeamsMessage(chatId, leagueCode, showBackButton) {
  const data = await loadLeagueTeamsData(leagueCode);
  if (!data || !Array.isArray(data.teams) || data.teams.length === 0) {
    return {
      text: t(
        'No team roster is available yet for this league. Please try again later.',
        chatId,
      ),
      reply_markup: { inline_keyboard: [] },
    };
  }

  const followedTeamIds = new Set(getUserLeagueTeamIds(chatId));
  const sortedTeams = sortTeamsByPosition(data.teams);

  const keyboard = sortedTeams.map((team) => {
    const teamId = buildTeamId(leagueCode, team.teamName);
    const tracked = followedTeamIds.has(teamId);
    const pos = team.position ?? '?';
    const label = team.teamName || team.userName || '—';

    return [
      {
        text: `${tracked ? '✅' : '⬜️'} ${pos}. ${label}`,
        callback_data: `${MANAGE_TRACKING_TOGGLE_CALLBACK_TYPE}:${leagueCode}:${team.position}`,
      },
    ];
  });

  if (showBackButton) {
    keyboard.push([
      {
        text: t('⬅️ Back to leagues', chatId),
        callback_data: MANAGE_TRACKING_BACK_CALLBACK_TYPE,
      },
    ]);
  }

  return {
    text: t('Toggle tracked teams in {LEAGUE}:', chatId, {
      LEAGUE: data.leagueName || leagueCode,
    }),
    reply_markup: { inline_keyboard: keyboard },
  };
}

async function sendManageTrackingLeagueMenu(bot, chatId, options = {}) {
  const leagues = await listUserLeagues(chatId);

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
    const payload = await buildManageTrackingTeamsMessage(
      chatId,
      leagues[0].leagueCode,
      false,
    );
    await bot.sendMessage(chatId, payload.text, {
      ...options,
      reply_markup: payload.reply_markup,
    });

    return;
  }

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: `${MANAGE_TRACKING_LEAGUE_CALLBACK_TYPE}:${league.leagueCode}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league would you like to manage tracked teams for?', chatId),
    {
      ...options,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

async function handleManageTrackingCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  try {
    await sendManageTrackingLeagueMenu(bot, chatId, {
      reply_to_message_id: msg.message_id,
    });
  } catch (err) {
    console.error('Error opening manage-tracking menu:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load your leagues: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );
  }
}

module.exports = {
  handleManageTrackingCommand,
  sendManageTrackingLeagueMenu,
  buildManageTrackingTeamsMessage,
};
