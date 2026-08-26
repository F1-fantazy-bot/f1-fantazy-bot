const { t } = require('../i18n');
const azureStorageService = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { ensureSourceIsLeague } = require('../utils/teamSourceSwitcher');
const {
  setCachedSelectedTeam,
} = require('../services/selectTeamService');
const {
  retainSelectedBestTeamPreferences,
} = require('../services/selectedBestTeamService');
const {
  getSelectedTeam,
  getTeamDisplayName,
  getUserLeagueTeamIds,
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
  buildLeagueTeamId,
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
 * Build the currently-followed state as an array of `{leagueCode, teamId}`.
 * The league teamId (`{sanitize(userName)}_{teamNo}`) is league-agnostic,
 * so a single followed team may map to MULTIPLE entries — one per followed
 * league where the same F1 Fantasy team appears. Seeding each match
 * enables per-league visual sync in the toggle UI.
 *
 * Position is NOT included — it's looked up fresh from the league data at
 * render time. Storing it would re-introduce the tied-position bug because
 * two distinct teams in a league can share a position.
 */
async function seedFollowedSelection(chatId) {
  const followed = new Set(getUserLeagueTeamIds(chatId));
  if (followed.size === 0) {
    return [];
  }

  const leagues = await listUserLeagues(chatId);
  const seeded = [];

  for (const league of leagues) {
    let data;
    try {
      data = await loadLeagueTeamsData(league.leagueCode);
    } catch (_err) {
      data = null;
    }
    if (!data || !Array.isArray(data.teams)) {continue;}

    for (const team of data.teams) {
      const candidateTeamId = buildLeagueTeamId(team.userName, team.teamNo);
      if (candidateTeamId && followed.has(candidateTeamId)) {
        seeded.push({
          leagueCode: league.leagueCode,
          teamId: candidateTeamId,
        });
      }
    }
  }

  return seeded;
}

/**
 * True when this fantasy team is staged in the session (independent of
 * which league row it was selected via — visual sync). Compares only on
 * the canonical `teamId`, which sidesteps tied-position ambiguity entirely.
 */
function isSelected(session, teamId) {
  if (!teamId) {return false;}

  return session.selected.some((sel) => sel.teamId === teamId);
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

/**
 * Count the number of DISTINCT followed F1-Fantasy teams currently staged
 * in the session. Multiple entries pointing at the same `teamId` (visual
 * sync — same team in multiple leagues) collapse to a single slot for the
 * cap.
 */
function countSelected(session) {
  const ids = new Set();
  for (const sel of session.selected) {
    if (sel.teamId) {
      ids.add(sel.teamId);
    }
  }

  return ids.size;
}

/**
 * Find every leagueCode in the user's followed leagues where the given
 * fantasy teamId appears. Used to expand a single toggle action into all
 * cross-league appearances (visual sync).
 */
async function findFantasyTeamLeagues(chatId, fantasyTeamId) {
  if (!fantasyTeamId) {return [];}
  const leagues = await listUserLeagues(chatId);
  const out = [];

  for (const league of leagues) {
    let data;
    try {
      data = await loadLeagueTeamsData(league.leagueCode);
    } catch (_err) {
      data = null;
    }
    if (!data || !Array.isArray(data.teams)) {continue;}

    const appears = data.teams.some(
      (team) =>
        buildLeagueTeamId(team.userName, team.teamNo) === fantasyTeamId,
    );
    if (appears) {
      out.push(league.leagueCode);
    }
  }

  return out;
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

  const rows = teams
    .map((team) => {
      const teamId = buildLeagueTeamId(team.userName, team.teamNo);
      if (!teamId) {
        // Row missing userName/teamNo — can't be followed reliably. Hide
        // it rather than render an un-toggleable button.
        return null;
      }
      const checked = isSelected(session, teamId);
      const prefix = checked ? '✅' : '⬜';

      return [
        {
          text: `${prefix} ${team.position}. ${team.teamName}`,
          callback_data: cb(
            TEAMS_TRACKER_ACTIONS.TOGGLE,
            leagueCode,
            teamId,
          ),
        },
      ];
    })
    .filter((row) => row !== null);

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
      selected: seeded.map(({ leagueCode, teamId }) => ({
        leagueCode,
        teamId,
      })),
      initiallyFollowed: Array.from(
        new Set(seeded.map(({ teamId }) => teamId).filter(Boolean)),
      ),
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

function isStaleCallbackQueryError(err) {
  const desc = err?.response?.body?.description || err?.message || '';

  return (
    typeof desc === 'string' &&
    (desc.includes('query is too old') ||
      desc.includes('query ID is invalid'))
  );
}

async function safeAnswerCallbackQuery(bot, queryId, options) {
  try {
    await bot.answerCallbackQuery(queryId, options);
  } catch (err) {
    if (isStaleCallbackQueryError(err)) {
      return;
    }
    throw err;
  }
}

async function respondExpired(bot, query) {
  await safeAnswerCallbackQuery(bot, query.id, {
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

  // Re-fetch every league that has staged selections so we work against
  // the latest roster. `previouslyFollowed` carries fantasy ids only — no
  // need to derive their source leagues here; we only resolve teams that
  // are still staged. Teams that were followed but no longer staged are
  // simply removed (no league lookup needed).
  const touchedLeagues = new Set(session.selected.map((s) => s.leagueCode));
  const leagueRosterByCode = {};
  for (const leagueCode of touchedLeagues) {
    try {
      leagueRosterByCode[leagueCode] = await refreshLeagueTeamsData(leagueCode);
    } catch (_err) {
      leagueRosterByCode[leagueCode] = null;
    }
  }

  // For each staged entry, find the matching roster row by canonical
  // teamId — NOT by position (positions are not unique within a league
  // when teams are tied). Dedup across leagues — the same fantasy team
  // selected via 2 leagues collapses to 1 final follow.
  const finalSelections = [];
  const finalSelectionByTeamId = new Map();
  let droppedStale = 0;

  for (const sel of session.selected) {
    if (!sel.teamId) {
      // Legacy entry from a pre-fix session blob — can't resolve.
      droppedStale += 1;
      continue;
    }
    if (finalSelectionByTeamId.has(sel.teamId)) {
      // Duplicate via visual sync — keep the first occurrence.
      continue;
    }
    const roster = leagueRosterByCode[sel.leagueCode];
    if (!roster || !Array.isArray(roster.teams)) {
      droppedStale += 1;
      continue;
    }
    const match = roster.teams.find(
      (team) =>
        buildLeagueTeamId(team.userName, team.teamNo) === sel.teamId,
    );
    if (!match) {
      droppedStale += 1;
      continue;
    }
    const entry = {
      leagueCode: sel.leagueCode,
      teamId: sel.teamId,
      leagueTeam: match,
    };
    finalSelections.push(entry);
    finalSelectionByTeamId.set(sel.teamId, entry);
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

  try {
    await retainSelectedBestTeamPreferences({
      chatId,
      teamIds: [...finalTeamIds],
      attributes: { selectedTeam: nextActive },
    });
    setCachedSelectedTeam(chatId, nextActive);
  } catch (err) {
    console.error(
      `Error persisting user attributes after teams tracker save for ${chatId}:`,
      err,
    );
    throw err;
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
      await safeAnswerCallbackQuery(bot, query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.BACK) {
      session.currentView = VIEW.LEAGUES;
      session.currentLeagueCode = null;
      await touchSession(chatId, session);
      await renderCurrentView(bot, chatId, session);
      await safeAnswerCallbackQuery(bot, query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.OPEN_LEAGUE) {
      const [leagueCode] = payload;
      session.currentView = VIEW.TEAMS;
      session.currentLeagueCode = leagueCode;
      await touchSession(chatId, session);
      await renderCurrentView(bot, chatId, session);
      await safeAnswerCallbackQuery(bot, query.id);

      return;
    }

    if (action === TEAMS_TRACKER_ACTIONS.TOGGLE) {
      const [leagueCode, teamId] = payload;
      if (!teamId) {
        // Defensive: callbacks from a pre-fix session may carry a numeric
        // position string instead of a teamId. Treat as expired.
        await respondExpired(bot, query);

        return;
      }

      const currentlySelected = isSelected(session, teamId);

      if (currentlySelected) {
        // Remove every entry staged for this fantasy team across all
        // leagues (visual sync).
        session.selected = session.selected.filter(
          (sel) => sel.teamId !== teamId,
        );
        session.addOrder = (session.addOrder || []).filter(
          (id) => id !== teamId,
        );
      } else {
        // Enforce the cap on DISTINCT fantasy teams. A team already in
        // the staged set wouldn't grow the count and is allowed.
        if (countSelected(session) >= MAX_FOLLOWED_LEAGUE_TEAMS) {
          await safeAnswerCallbackQuery(bot, query.id, {
            text: t(
              'You can follow at most {MAX} teams. Deselect one first.',
              chatId,
            ).replace('{MAX}', MAX_FOLLOWED_LEAGUE_TEAMS),
            show_alert: true,
          });

          return;
        }

        // Add an entry for every followed league where this fantasy team
        // appears (visual sync). Fall back to just the league it was
        // toggled from when lookup fails for any reason.
        let leagues = await findFantasyTeamLeagues(chatId, teamId);
        if (leagues.length === 0) {
          leagues = [leagueCode];
        }
        for (const lc of leagues) {
          const exists = session.selected.some(
            (sel) => sel.leagueCode === lc && sel.teamId === teamId,
          );
          if (!exists) {
            session.selected.push({ leagueCode: lc, teamId });
          }
        }
        pushAddOrderIfNew(session, teamId);
      }

      await touchSession(chatId, session);
      await renderCurrentView(bot, chatId, session);
      await safeAnswerCallbackQuery(bot, query.id);

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
          ? getTeamDisplayName(chatId, result.nextActive)
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
      await safeAnswerCallbackQuery(bot, query.id);
      await sendLogMessage(
        bot,
        `User ${getDisplayName(chatId)} updated teams tracker: ${
          result.finalCount
        } followed, active=${result.nextActive || 'none'}.`,
      );

      return;
    }

    await safeAnswerCallbackQuery(bot, query.id);
  } catch (error) {
    if (isStaleCallbackQueryError(error)) {
      return;
    }
    console.error(`Error handling teams tracker callback for ${chatId}:`, error);
    await sendErrorMessage(
      bot,
      `Teams tracker callback error for ${getDisplayName(chatId)}: ${error.message}`,
    );
    try {
      await safeAnswerCallbackQuery(bot, query.id, {
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
