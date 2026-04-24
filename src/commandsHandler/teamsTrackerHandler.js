const { t } = require('../i18n');
const azureStorageService = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { updateUserAttributes } = require('../userRegistryService');
const { ensureSourceIsLeague } = require('../utils/teamSourceSwitcher');
const {
  currentTeamCache,
  userCache,
  getSelectedTeam,
  getUserLeagueTeamIds,
  serializeSelectedBestTeamByTeam,
  normalizeSelectedBestTeamByTeam,
  clearSelectedBestTeam,
} = require('../cache');
const {
  sendErrorMessage,
  sendLogMessage,
  getDisplayName,
} = require('../utils/utils');
const {
  loadLeagueTeamsData,
  refreshLeagueTeamsData,
  followLeagueTeam,
  removeFollowedTeam,
  extractLeagueCode,
  buildTeamId,
} = require('../utils/leagueTeamHelpers');
const {
  TEAMS_TRACKER_CALLBACK_TYPE,
  TEAMS_TRACKER_ACTIONS,
  TEAMS_TRACKER_SESSION_TTL_MS,
  MAX_FOLLOWED_LEAGUE_TEAMS,
  COMMAND_FOLLOW_LEAGUE,
} = require('../constants');

const VIEW = { LEAGUES: 'leagues', TEAMS: 'teams' };

function cb(action, ...payload) {
  return [TEAMS_TRACKER_CALLBACK_TYPE, action, ...payload].join(':');
}

function isSessionExpired(session) {
  if (!session || !session.updatedAt) {
    return true;
  }
  const age = Date.now() - new Date(session.updatedAt).getTime();

  return Number.isNaN(age) || age > TEAMS_TRACKER_SESSION_TTL_MS;
}

async function touchSession(chatId, session) {
  session.updatedAt = new Date().toISOString();
  await azureStorageService.saveTeamsTrackerSession(chatId, session);
}

/**
 * Build the currently-followed state as an array of {leagueCode, position}.
 * `position` is sourced from the blob data (teamId format
 * `{leagueCode}_{sanitizedTeamName}` doesn't contain a position). For each
 * followed teamId we look up the matching team by sanitized name in the
 * league's teams-data.json.
 */
async function seedFollowedSelection(chatId) {
  const followed = getUserLeagueTeamIds(chatId);
  const seeded = [];

  for (const teamId of followed) {
    const leagueCode = extractLeagueCode(teamId);
    if (!leagueCode) {continue;}
    let data;
    try {
      data = await loadLeagueTeamsData(leagueCode);
    } catch (_err) {
      data = null;
    }
    if (!data || !Array.isArray(data.teams)) {continue;}

    const match = data.teams.find((team) => {
      const candidateTeamId = buildTeamId(leagueCode, team.teamName);

      return candidateTeamId === teamId;
    });
    if (!match) {continue;}
    seeded.push({ leagueCode, position: match.position, teamId });
  }

  return seeded;
}

async function resolveTeamIdByPosition(leagueCode, position) {
  const data = await loadLeagueTeamsData(leagueCode);
  const match = data?.teams?.find((team) => team.position === position);

  return match ? buildTeamId(leagueCode, match.teamName) : null;
}

function isSelected(session, leagueCode, position) {
  return session.selected.some(
    (sel) => sel.leagueCode === leagueCode && sel.position === position,
  );
}

function pushAddOrderIfNew(session, teamId) {
  if ((session.initiallyFollowed || []).includes(teamId)) {
    return;
  }
  session.addOrder = session.addOrder || [];
  if (!session.addOrder.includes(teamId)) {
    session.addOrder.push(teamId);
  }
}

function countSelected(session) {
  return session.selected.length;
}

async function buildLeagueListKeyboard(chatId, session, leagues) {
  const counts = {};
  for (const sel of session.selected) {
    counts[sel.leagueCode] = (counts[sel.leagueCode] || 0) + 1;
  }

  const rows = leagues.map((league) => {
    const count = counts[league.leagueCode] || 0;

    return [
      {
        text: `${league.leagueName || league.leagueCode} (${count})`,
        callback_data: cb(TEAMS_TRACKER_ACTIONS.OPEN_LEAGUE, league.leagueCode),
      },
    ];
  });

  rows.push([
    {
      text: t('💾 Save ({N}/{MAX})', chatId)
        .replace('{N}', countSelected(session))
        .replace('{MAX}', MAX_FOLLOWED_LEAGUE_TEAMS),
      callback_data: cb(TEAMS_TRACKER_ACTIONS.SAVE),
    },
    {
      text: t('✖ Cancel', chatId),
      callback_data: cb(TEAMS_TRACKER_ACTIONS.CANCEL),
    },
  ]);

  return rows;
}

async function buildTeamsKeyboard(chatId, session, leagueCode, multiLeague) {
  const data = await loadLeagueTeamsData(leagueCode);
  const teams =
    data && Array.isArray(data.teams)
      ? [...data.teams].sort((a, b) => (a.position || 0) - (b.position || 0))
      : [];

  const rows = teams.map((team) => {
    const checked = isSelected(session, leagueCode, team.position);
    const prefix = checked ? '✅' : '⬜';

    return [
      {
        text: `${prefix} ${team.position}. ${team.teamName}`,
        callback_data: cb(
          TEAMS_TRACKER_ACTIONS.TOGGLE,
          leagueCode,
          String(team.position),
        ),
      },
    ];
  });

  const bottom = [];
  if (multiLeague) {
    bottom.push({
      text: t('⬅ Back', chatId),
      callback_data: cb(TEAMS_TRACKER_ACTIONS.BACK),
    });
  }
  bottom.push({
    text: t('💾 Save ({N}/{MAX})', chatId)
      .replace('{N}', countSelected(session))
      .replace('{MAX}', MAX_FOLLOWED_LEAGUE_TEAMS),
    callback_data: cb(TEAMS_TRACKER_ACTIONS.SAVE),
  });
  bottom.push({
    text: t('✖ Cancel', chatId),
    callback_data: cb(TEAMS_TRACKER_ACTIONS.CANCEL),
  });
  rows.push(bottom);

  return rows;
}

async function renderCurrentView(bot, chatId, session) {
  const leagues = await listUserLeagues(chatId);
  const multiLeague = leagues.length > 1;
  const view = session.currentView || VIEW.LEAGUES;

  let text;
  let keyboard;

  if (view === VIEW.TEAMS) {
    keyboard = await buildTeamsKeyboard(
      chatId,
      session,
      session.currentLeagueCode,
      multiLeague,
    );
    text = t('Toggle teams to follow. Save when done.', chatId);
  } else {
    keyboard = await buildLeagueListKeyboard(chatId, session, leagues);
    text = t('Pick a league to manage followed teams:', chatId);
  }

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: session.messageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function expireOldMessage(bot, chatId, oldMessageId) {
  try {
    await bot.editMessageText(
      t('❌ Expired — reopen /teams_tracker', chatId),
      { chat_id: chatId, message_id: oldMessageId },
    );
  } catch (_err) {
    // best-effort; ignore if the old message is gone or already edited
  }
}

/**
 * Entry-point for the /teams_tracker command.
 */
async function handleTeamsTrackerCommand(bot, msg) {
  const chatId = msg.chat.id;
  try {
    const leagues = await listUserLeagues(chatId);
    if (leagues.length === 0) {
      await bot.sendMessage(
        chatId,
        t(
          'You are not following any league. Run {CMD} to follow one first.',
          chatId,
        ).replace('{CMD}', COMMAND_FOLLOW_LEAGUE),
      );

      return;
    }

    // Expire any existing session message (best effort).
    let existing = null;
    try {
      existing = await azureStorageService.getTeamsTrackerSession(chatId);
    } catch (_err) {
      existing = null;
    }
    if (existing && existing.messageId) {
      await expireOldMessage(bot, chatId, existing.messageId);
    }

    const seeded = await seedFollowedSelection(chatId);
    const multiLeague = leagues.length > 1;
    const singleLeagueCode = multiLeague ? null : leagues[0].leagueCode;

    const session = {
      chatId,
      messageId: null,
      currentView: multiLeague ? VIEW.LEAGUES : VIEW.TEAMS,
      currentLeagueCode: singleLeagueCode,
      selected: seeded.map(({ leagueCode, position }) => ({
        leagueCode,
        position,
      })),
      initiallyFollowed: seeded.map(({ teamId }) => teamId),
      addOrder: [],
      updatedAt: new Date().toISOString(),
    };

    const placeholderText = multiLeague
      ? t('Pick a league to manage followed teams:', chatId)
      : t('Toggle teams to follow. Save when done.', chatId);

    const sent = await bot.sendMessage(chatId, placeholderText);
    session.messageId = sent.message_id;

    await azureStorageService.saveTeamsTrackerSession(chatId, session);
    await renderCurrentView(bot, chatId, session);
  } catch (error) {
    console.error(`Error in /teams_tracker for ${chatId}:`, error);
    await sendErrorMessage(
      bot,
      `Teams tracker failed for ${getDisplayName(chatId)}: ${error.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to save teams tracker: {ERROR}', chatId).replace(
        '{ERROR}',
        error.message,
      ),
    );
  }
}

function parsePayload(data) {
  const parts = data.split(':');

  return { action: parts[1], payload: parts.slice(2) };
}

async function respondExpired(bot, query) {
  await bot.answerCallbackQuery(query.id, {
    text: t(
      'This Teams Tracker view has expired. Open /teams_tracker again.',
      query.message.chat.id,
    ),
    show_alert: true,
  });
}

/**
 * Run staged selection against current follow-state.
 */
async function applySave(bot, chatId, session) {
  const prevActive = getSelectedTeam(chatId);
  const previouslyFollowed = new Set(session.initiallyFollowed || []);

  // Re-fetch all touched leagues, and resolve staged selection into final
  // teamId list; drop stale positions.
  const touchedLeagues = new Set([
    ...session.selected.map((s) => s.leagueCode),
    ...Array.from(previouslyFollowed)
      .map(extractLeagueCode)
      .filter(Boolean),
  ]);
  const leagueRosterByCode = {};
  for (const leagueCode of touchedLeagues) {
    try {
      leagueRosterByCode[leagueCode] = await refreshLeagueTeamsData(leagueCode);
    } catch (_err) {
      leagueRosterByCode[leagueCode] = null;
    }
  }

  const finalSelections = [];
  let droppedStale = 0;
  for (const sel of session.selected) {
    const roster = leagueRosterByCode[sel.leagueCode];
    if (!roster || !Array.isArray(roster.teams)) {
      droppedStale += 1;
      continue;
    }
    const match = roster.teams.find((team) => team.position === sel.position);
    if (!match) {
      droppedStale += 1;
      continue;
    }
    const teamId = buildTeamId(sel.leagueCode, match.teamName);
    finalSelections.push({
      leagueCode: sel.leagueCode,
      position: sel.position,
      teamId,
      leagueTeam: match,
    });
  }

  const finalTeamIds = new Set(finalSelections.map((sel) => sel.teamId));

  // If we end up with at least one league team, ensure screenshots are gone.
  if (finalSelections.length > 0) {
    await ensureSourceIsLeague(bot, chatId);
  }

  // Remove teams that were previously followed but are no longer selected.
  for (const teamId of previouslyFollowed) {
    if (!finalTeamIds.has(teamId)) {
      await removeFollowedTeam(bot, chatId, teamId, {
        mutateSelectedTeam: false,
      });
    }
  }

  // Add newly selected teams that weren't previously followed.
  const addedTeamIds = [];
  for (const sel of finalSelections) {
    if (previouslyFollowed.has(sel.teamId)) {continue;}
    try {
      await followLeagueTeam(bot, chatId, {
        teamId: sel.teamId,
        leagueTeam: sel.leagueTeam,
      });
      addedTeamIds.push(sel.teamId);
    } catch (err) {
      console.error(
        `Error following league team ${sel.teamId} for ${chatId}:`,
        err,
      );
      droppedStale += 1;
      finalTeamIds.delete(sel.teamId);
    }
  }

  // Resolve active team deterministically.
  let nextActive = null;
  if (prevActive && finalTeamIds.has(prevActive)) {
    nextActive = prevActive;
  } else if (session.addOrder && session.addOrder.length > 0) {
    nextActive =
      session.addOrder.find((teamId) => finalTeamIds.has(teamId)) || null;
  }
  if (!nextActive && addedTeamIds.length > 0) {
    nextActive = addedTeamIds.find((teamId) => finalTeamIds.has(teamId)) ||
      null;
  }
  if (!nextActive) {
    const remaining = getUserLeagueTeamIds(chatId);
    nextActive = remaining[0] || null;
  }

  const key = String(chatId);
  if (!userCache[key]) {userCache[key] = {};}
  if (nextActive) {
    userCache[key].selectedTeam = nextActive;
  } else {
    delete userCache[key].selectedTeam;
  }

  // Drop selectedBestTeam entries for teams no longer followed.
  const selectedBestTeamByTeam = normalizeSelectedBestTeamByTeam(
    userCache[key].selectedBestTeamByTeam,
  );
  for (const teamId of Object.keys(selectedBestTeamByTeam)) {
    if (!finalTeamIds.has(teamId)) {
      clearSelectedBestTeam(chatId, teamId);
    }
  }

  try {
    await updateUserAttributes(chatId, {
      selectedTeam: nextActive,
      selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
        normalizeSelectedBestTeamByTeam(
          userCache[key].selectedBestTeamByTeam,
        ),
      ),
    });
  } catch (err) {
    console.error(
      `Error persisting user attributes after teams tracker save for ${chatId}:`,
      err,
    );
  }

  await azureStorageService.deleteTeamsTrackerSession(chatId);

  return {
    finalCount: finalTeamIds.size,
    nextActive,
    droppedStale,
  };
}

/**
 * Callback entry-point (dispatched by callbackQueryHandler).
 */
async function handleTeamsTrackerCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const { action, payload } = parsePayload(query.data);

  let session;
  try {
    session = await azureStorageService.getTeamsTrackerSession(chatId);
  } catch (err) {
    console.error(`Error reading teams tracker session for ${chatId}:`, err);
    await respondExpired(bot, query);

    return;
  }

  if (!session || isSessionExpired(session) || session.messageId !== messageId) {
    if (session && isSessionExpired(session)) {
      try {
        await azureStorageService.deleteTeamsTrackerSession(chatId);
      } catch (_err) {
        /* ignore */
      }
    }
    await respondExpired(bot, query);

    return;
  }

  try {
    if (action === TEAMS_TRACKER_ACTIONS.CANCEL) {
      await azureStorageService.deleteTeamsTrackerSession(chatId);
      await bot.editMessageText(
        t('Teams tracker cancelled. No changes saved.', chatId),
        { chat_id: chatId, message_id: messageId },
      );
      await bot.answerCallbackQuery(query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.BACK) {
      session.currentView = VIEW.LEAGUES;
      session.currentLeagueCode = null;
      await touchSession(chatId, session);
      await renderCurrentView(bot, chatId, session);
      await bot.answerCallbackQuery(query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.OPEN_LEAGUE) {
      const [leagueCode] = payload;
      session.currentView = VIEW.TEAMS;
      session.currentLeagueCode = leagueCode;
      await touchSession(chatId, session);
      await renderCurrentView(bot, chatId, session);
      await bot.answerCallbackQuery(query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.TOGGLE) {
      const [leagueCode, positionStr] = payload;
      const position = Number(positionStr);
      const currentlySelected = isSelected(session, leagueCode, position);

      if (!currentlySelected && countSelected(session) >= MAX_FOLLOWED_LEAGUE_TEAMS) {
        await bot.answerCallbackQuery(query.id, {
          text: t(
            'You can follow at most {MAX} teams. Deselect one first.',
            chatId,
          ).replace('{MAX}', MAX_FOLLOWED_LEAGUE_TEAMS),
          show_alert: true,
        });

        return;
      }

      if (currentlySelected) {
        session.selected = session.selected.filter(
          (sel) =>
            !(sel.leagueCode === leagueCode && sel.position === position),
        );
        const teamId = await resolveTeamIdByPosition(leagueCode, position);
        if (teamId) {
          session.addOrder = (session.addOrder || []).filter(
            (id) => id !== teamId,
          );
        }
      } else {
        session.selected.push({ leagueCode, position });
        const teamId = await resolveTeamIdByPosition(leagueCode, position);
        if (teamId) {
          pushAddOrderIfNew(session, teamId);
        }
      }

      await touchSession(chatId, session);
      await renderCurrentView(bot, chatId, session);
      await bot.answerCallbackQuery(query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.SAVE) {
      const result = await applySave(bot, chatId, session);

      let confirmation;
      if (result.finalCount === 0) {
        confirmation = t(
          '✅ Teams tracker updated. No teams are being followed.',
          chatId,
        );
      } else {
        const activeLabel = result.nextActive
          ? currentTeamCache[chatId]?.[result.nextActive]?.teamName ||
            result.nextActive
          : t('no active team', chatId);
        confirmation = t(
          '✅ Teams tracker updated. Following {N}/{MAX}. Active team: {TEAM}.',
          chatId,
        )
          .replace('{N}', result.finalCount)
          .replace('{MAX}', MAX_FOLLOWED_LEAGUE_TEAMS)
          .replace('{TEAM}', activeLabel);
      }

      if (result.droppedStale > 0) {
        confirmation +=
          '\n' +
          t(
            '⚠️ {N} team(s) could not be added (league roster changed).',
            chatId,
          ).replace('{N}', result.droppedStale);
      }

      await bot.editMessageText(confirmation, {
        chat_id: chatId,
        message_id: messageId,
      });
      await bot.answerCallbackQuery(query.id);
      await sendLogMessage(
        bot,
        `User ${getDisplayName(chatId)} updated teams tracker: ${
          result.finalCount
        } followed, active=${result.nextActive || 'none'}.`,
      );

      return;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error(`Error handling teams tracker callback for ${chatId}:`, error);
    await sendErrorMessage(
      bot,
      `Teams tracker callback error for ${getDisplayName(chatId)}: ${error.message}`,
    );
    try {
      await bot.answerCallbackQuery(query.id, {
        text: t('❌ Failed to save teams tracker: {ERROR}', chatId).replace(
          '{ERROR}',
          error.message,
        ),
        show_alert: true,
      });
    } catch (_err) {
      /* ignore */
    }
  }
}

module.exports = {
  handleTeamsTrackerCommand,
  handleTeamsTrackerCallback,
};
