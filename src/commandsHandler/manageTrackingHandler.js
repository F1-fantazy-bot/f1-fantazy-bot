const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getUserLeagueTeamIds } = require('../cache');
const { buildTeamId } = require('../utils/teamId');
const {
  COMMAND_FOLLOW_LEAGUE,
  MAX_FOLLOWED_LEAGUE_TEAMS,
  MANAGE_TRACKING_LEAGUE_CALLBACK_TYPE,
  MANAGE_TRACKING_TOGGLE_CALLBACK_TYPE,
  MANAGE_TRACKING_BACK_CALLBACK_TYPE,
  MANAGE_TRACKING_SAVE_CALLBACK_TYPE,
} = require('../constants');
const {
  loadLeagueTeamsData,
  applyLeagueTeamSelection,
} = require('./selectTeamFromLeagueHandler');
const { removeFollowedTeam } = require('./unfollowTeamHandler');

const pendingTrackingSelections = {};

function sortTeamsByPosition(teams) {
  return [...teams].sort((a, b) => (a.position || 0) - (b.position || 0));
}

function getPendingKey(chatId, leagueCode) {
  return `${chatId}:${leagueCode}`;
}

function getTrackedTeamIdsByLeague(chatId, leagueCode) {
  const prefix = `${leagueCode}_`;

  return getUserLeagueTeamIds(chatId).filter((teamId) => teamId.startsWith(prefix));
}

async function initializePendingSelection(chatId, leagueCode) {
  const data = await loadLeagueTeamsData(leagueCode);
  if (!data || !Array.isArray(data.teams) || data.teams.length === 0) {
    return null;
  }

  const key = getPendingKey(chatId, leagueCode);
  if (pendingTrackingSelections[key]) {
    return pendingTrackingSelections[key];
  }

  const selectedTeamIds = new Set(getTrackedTeamIdsByLeague(chatId, leagueCode));
  const state = {
    leagueCode,
    data,
    selectedTeamIds,
  };
  pendingTrackingSelections[key] = state;

  return state;
}

function clearPendingSelection(chatId, leagueCode) {
  delete pendingTrackingSelections[getPendingKey(chatId, leagueCode)];
}

async function buildManageTrackingTeamsMessage(chatId, leagueCode, showBackButton) {
  const state = await initializePendingSelection(chatId, leagueCode);
  if (!state) {
    return {
      text: t(
        'No team roster is available yet for this league. Please try again later.',
        chatId,
      ),
      reply_markup: { inline_keyboard: [] },
    };
  }

  const sortedTeams = sortTeamsByPosition(state.data.teams);
  const keyboard = sortedTeams.map((team) => {
    const teamId = buildTeamId(leagueCode, team.teamName);
    const tracked = state.selectedTeamIds.has(teamId);
    const pos = team.position ?? '?';
    const label = team.teamName || team.userName || '—';

    return [
      {
        text: `${tracked ? '✅' : '⬜️'} ${pos}. ${label}`,
        callback_data: `${MANAGE_TRACKING_TOGGLE_CALLBACK_TYPE}:${leagueCode}:${team.position}`,
      },
    ];
  });

  keyboard.push([
    {
      text: t('💾 Save changes', chatId),
      callback_data: `${MANAGE_TRACKING_SAVE_CALLBACK_TYPE}:${leagueCode}`,
    },
  ]);

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
      LEAGUE: state.data.leagueName || leagueCode,
    }),
    reply_markup: { inline_keyboard: keyboard },
  };
}

async function togglePendingTrackedTeam(chatId, leagueCode, position) {
  const state = await initializePendingSelection(chatId, leagueCode);
  if (!state) {
    throw new Error('No league team roster');
  }

  const selectedTeam = state.data.teams.find(
    (team) => team.position === Number(position),
  );
  if (!selectedTeam) {
    throw new Error('Team not found');
  }

  const teamId = buildTeamId(leagueCode, selectedTeam.teamName);
  if (state.selectedTeamIds.has(teamId)) {
    state.selectedTeamIds.delete(teamId);
  } else {
    const currentLeagueTracked = getTrackedTeamIdsByLeague(chatId, leagueCode);
    const trackedOutsideLeague =
      getUserLeagueTeamIds(chatId).length - currentLeagueTracked.length;
    const projectedTrackedCount =
      trackedOutsideLeague + state.selectedTeamIds.size + 1;
    if (projectedTrackedCount > MAX_FOLLOWED_LEAGUE_TEAMS) {
      throw new Error(t('You can track up to 6 teams. Untrack one first.', chatId));
    }

    state.selectedTeamIds.add(teamId);
  }
}

async function savePendingTrackedTeams(bot, chatId, leagueCode) {
  const state = await initializePendingSelection(chatId, leagueCode);
  if (!state) {
    throw new Error('No league team roster');
  }

  const currentLeagueTracked = new Set(getTrackedTeamIdsByLeague(chatId, leagueCode));
  const desiredLeagueTracked = state.selectedTeamIds;

  const toRemove = [...currentLeagueTracked].filter(
    (teamId) => !desiredLeagueTracked.has(teamId),
  );
  const toAdd = [...desiredLeagueTracked].filter(
    (teamId) => !currentLeagueTracked.has(teamId),
  );

  const totalCurrentlyTracked = getUserLeagueTeamIds(chatId).length;
  const projectedTrackedCount =
    totalCurrentlyTracked - toRemove.length + toAdd.length;

  if (projectedTrackedCount > MAX_FOLLOWED_LEAGUE_TEAMS) {
    throw new Error(
      t('You can track up to 6 teams. Untrack one first.', chatId),
    );
  }

  for (const teamId of toRemove) {
    await removeFollowedTeam(bot, chatId, teamId);
  }

  for (const teamId of toAdd) {
    const team = state.data.teams.find(
      (entry) => buildTeamId(leagueCode, entry.teamName) === teamId,
    );
    if (!team) {
      continue;
    }
    await applyLeagueTeamSelection(bot, chatId, leagueCode, team.position);
  }

  clearPendingSelection(chatId, leagueCode);

  return {
    added: toAdd.length,
    removed: toRemove.length,
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
    console.error('Error opening teams-tracker menu:', err);
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
  togglePendingTrackedTeam,
  savePendingTrackedTeams,
};
