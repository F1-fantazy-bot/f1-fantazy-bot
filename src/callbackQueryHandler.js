const azureStorageService = require('./azureStorageService');
const {
  currentTeamCache,
  getPrintableCache,
  getTeamDisplayName,
  bestTeamsCache,
} = require('./cache');
const { selectChip } = require('./commandsHandler/selectChipHandlers');
const {
  CURRENT_TEAM_PHOTO_TYPE,
  CHIP_CALLBACK_TYPE,
  MENU_CALLBACK_TYPE,
  LANG_CALLBACK_TYPE,
  TEAM_CALLBACK_TYPE,
  TEAM_ASSIGN_CALLBACK_TYPE,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
  DEADLINE_CALLBACK_TYPE,
  LEAGUE_CALLBACK_TYPE,
  LEAGUE_UNFOLLOW_CALLBACK_TYPE,
  TEAMS_TRACKER_CALLBACK_TYPE,
  LEAGUE_GRAPH_CALLBACK_TYPE,
  LEAGUE_GRAPH_TYPE_CALLBACK_TYPE,
  LEAGUE_GRAPH_TYPES,
  LEAGUE_CHANGES_CALLBACK_TYPE,
  RACE_SUMMARY_CALLBACK_TYPE,
  LIVE_SCORE_CALLBACK_TYPE,
} = require('./constants');

const { sendLogMessage, sendMessageToUser } = require('./utils');
const { ensureSourceIsScreenshot } = require('./utils/teamSourceSwitcher');
const { handleMenuCallback } = require('./commandsHandler/menuHandler');
const { t, getLanguageName } = require('./i18n');
const {
  setLanguagePreference,
} = require('./services/setLanguageService');
const {
  refreshTelegramUserPreferences,
} = require('./services/telegramUserPreferencesService');
const {
  selectTeamPreference,
  setCachedSelectedTeam,
} = require('./services/selectTeamService');
const {
  setBestTeamRankingPreference,
} = require('./services/setBestTeamRankingService');
const {
  runChipMutation,
  clearTeamDerivedPreferences,
} = require('./services/activateChipService');
const {
  captureTeamState,
  restoreTeamState,
} = require('./services/teamStateSnapshotService');
const {
  getDeadlinePayload,
  getRefreshMarkup,
} = require('./commandsHandler/deadlineHandler');
const { sendLeaderboard } = require('./commandsHandler/leaderboardHandler');
const { sendLeagueChanges } = require('./commandsHandler/leagueChangesHandler');
const { sendRaceSummary } = require('./commandsHandler/raceSummaryHandler');
const {
  unfollowLeague,
} = require('./services/unfollowLeagueService');
const {
  handleLiveScoreCallback,
} = require('./commandsHandler/liveScoreHandler');
const {
  sendLeagueGraph,
  sendGraphTypePicker,
} = require('./commandsHandler/leagueGraphHandler');
const {
  sendLeagueBudgetGraph,
} = require('./commandsHandler/leagueBudgetGraphHandler');
const {
  sendLeagueStandingsGraph,
} = require('./commandsHandler/leagueStandingsGraphHandler');
const {
  handleTeamsTrackerCallback,
} = require('./commandsHandler/teamsTrackerHandler');

exports.handleCallbackQuery = async function (bot, query) {
  const chatId = query.message?.chat?.id;
  if (Number.isFinite(chatId)) {
    try {
      await refreshTelegramUserPreferences(chatId);
    } catch (err) {
      console.error('Error refreshing user preferences from registry:', err);
    }
  }

  const callbackType = query.data.split(':')[0];

  switch (callbackType) {
    case CHIP_CALLBACK_TYPE:
      return await handleChipCallback(bot, query);
    case LANG_CALLBACK_TYPE:
      return await handleLanguageCallback(bot, query);
    case MENU_CALLBACK_TYPE:
      return await handleMenuCallback(bot, query);
    case TEAM_CALLBACK_TYPE:
      return await handleTeamCallback(bot, query);
    case TEAM_ASSIGN_CALLBACK_TYPE:
      return await handleTeamAssignCallback(bot, query);
    case BEST_TEAM_WEIGHTS_CALLBACK_TYPE:
      return await handleBestTeamRankingCallback(bot, query);
    case DEADLINE_CALLBACK_TYPE:
      return await handleDeadlineRefreshCallback(bot, query);
    case LEAGUE_CALLBACK_TYPE:
      return await handleLeagueCallback(bot, query);
    case LEAGUE_UNFOLLOW_CALLBACK_TYPE:
      return await handleLeagueUnfollowCallback(bot, query);
    case TEAMS_TRACKER_CALLBACK_TYPE:
      return await handleTeamsTrackerCallback(bot, query);
    case LEAGUE_GRAPH_CALLBACK_TYPE:
      return await handleLeagueGraphCallback(bot, query);
    case LEAGUE_GRAPH_TYPE_CALLBACK_TYPE:
      return await handleLeagueGraphTypeCallback(bot, query);
    case LEAGUE_CHANGES_CALLBACK_TYPE:
      return await handleLeagueChangesCallback(bot, query);
    case RACE_SUMMARY_CALLBACK_TYPE:
      return await handleRaceSummaryCallback(bot, query);
    case LIVE_SCORE_CALLBACK_TYPE:
      return await handleLiveScoreCallback(bot, query);
    default:
      await sendLogMessage(bot, `Unknown callback type: ${callbackType}`);
  }
};

function isTelegramMessageNotModifiedError(error) {
  const description =
    error?.response?.body?.description || error?.message || '';

  return description.toLowerCase().includes('message is not modified');
}

async function handleDeadlineRefreshCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  try {
    const payload = await getDeadlinePayload(chatId);

    try {
      await bot.editMessageText(payload.text, {
        chat_id: chatId,
        message_id: messageId,
        ...payload.options,
      });
    } catch (error) {
      if (!isTelegramMessageNotModifiedError(error)) {
        throw error;
      }
    }
  } catch (error) {
    const fallbackText = t(
      'Failed to fetch deadline data. Please try again later.',
      chatId,
    );

    try {
      await bot.editMessageText(fallbackText, {
        chat_id: chatId,
        message_id: messageId,
        ...getRefreshMarkup(chatId),
      });
    } catch (editError) {
      if (!isTelegramMessageNotModifiedError(editError)) {
        throw editError;
      }
    }
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleChipCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const chip = query.data.split(':')[1];

  const message = await selectChip(bot, chatId, chip);

  if (message) {
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  // Answer callback to remove "Loading..." spinner
  await bot.answerCallbackQuery(query.id);
}

async function handleLanguageCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const lang = query.data.split(':')[1];

  const result = await setLanguagePreference({ chatId, lang });

  if (result.status !== 'ok') {
    await bot.editMessageText(
      t('Invalid language. Supported languages: {LANGS}', chatId, {
        LANGS: result.supportedLanguages.join(', '),
      }),
      {
        chat_id: chatId,
        message_id: messageId,
      },
    );
    await bot.answerCallbackQuery(query.id);

    return;
  }

  await bot.editMessageText(
    t('Language changed to {LANG}.', chatId, {
      LANG: getLanguageName(lang, chatId),
    }),
    {
      chat_id: chatId,
      message_id: messageId,
    },
  );

  await bot.answerCallbackQuery(query.id);
}

async function handleBestTeamRankingCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.split(':')[1];
  const presetId = query.data.split(':')[2];

  const result = await setBestTeamRankingPreference({
    chatId,
    teamId,
    presetId,
  });
  if (result.status !== 'ok') {
    await bot.answerCallbackQuery(query.id, {
      text: t(
        'That ranking option is no longer available. Reopen /set_best_team_ranking and choose again.',
        chatId,
      ),
      show_alert: true,
    });

    return;
  }

  let confirmationMessage = result.summary;
  if (result.changed) {
    confirmationMessage +=
      '\n' +
      t(
        'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.',
        chatId,
        { CMD: '/best_teams' },
      );
  }

  await bot.editMessageText(confirmationMessage, {
    chat_id: chatId,
    message_id: messageId,
  });

  await bot.answerCallbackQuery(query.id);
}

async function handleTeamCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.split(':')[1];

  const result = await selectTeamPreference({ chatId, teamId });
  if (result.status !== 'ok') {
    await bot.answerCallbackQuery(query.id, {
      text: t(
        'That team is no longer available. Reopen /select_team and choose again.',
        chatId,
      ),
      show_alert: true,
    });

    return;
  }

  // Edit message to confirm
  await bot.editMessageText(
    t('Active team switched to {TEAM}.', chatId, {
      TEAM: result.teamName,
    }),
    { chat_id: chatId, message_id: messageId },
  );
  await bot.answerCallbackQuery(query.id);
}

async function handleTeamAssignCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [_, uniqueKey, teamId] = query.data.split(':');

  let teamData;
  await runChipMutation(chatId, async () => {
    // Claim the assignment while holding the durable per-user mutation lock.
    teamData = await azureStorageService.getPendingTeamAssignment(
      chatId,
      uniqueKey,
    );
    if (!teamData) {
      return;
    }
    await azureStorageService.deletePendingTeamAssignment(chatId, uniqueKey);

    const snapshot = captureTeamState(chatId);
    try {
      // Cross-source rule: adding a screenshot team wipes any followed league teams.
      await ensureSourceIsScreenshot(bot, chatId);
      await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);
      await clearTeamDerivedPreferences({
        chatId,
        teamId,
        attributes: { selectedTeam: teamId },
      });
    } catch (err) {
      await restoreTeamState(bot, chatId, snapshot);
      await azureStorageService.savePendingTeamAssignment(
        chatId,
        uniqueKey,
        teamData,
      );
      throw err;
    }

    if (!currentTeamCache[chatId]) {
      currentTeamCache[chatId] = {};
    }
    currentTeamCache[chatId][teamId] = teamData;
    setCachedSelectedTeam(chatId, teamId);
    if (bestTeamsCache[chatId]) {
      delete bestTeamsCache[chatId][teamId];
    }
  });

  if (!teamData) {
    await bot.editMessageText(
      t('An error occurred while extracting data from the photo.', chatId),
      { chat_id: chatId, message_id: messageId },
    );
    await bot.answerCallbackQuery(query.id);

    return;
  }

  // Edit message to confirm
  await bot.editMessageText(
    t('Selected Team: {TEAM}', chatId, {
      TEAM: getTeamDisplayName(chatId, teamId),
    }),
    { chat_id: chatId, message_id: messageId },
  );

  // Notify about auto-switch
  await sendMessageToUser(
    bot,
    chatId,
    t('🔄 Active team auto-switched to {TEAM}.', chatId, {
      TEAM: getTeamDisplayName(chatId, teamId),
    }),
    { errorMessageToLog: 'Error sending auto-switch message' },
  );

  // Send printable cache
  await sendMessageToUser(
    bot,
    chatId,
    getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE),
    {
      useMarkdown: true,
      errorMessageToLog: 'Error sending extracted data to user',
    },
  );

  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueCallback(bot, query) {
  const chatId = query.message.chat.id;
  const leagueCode = query.data.split(':')[1];

  await sendLeaderboard(bot, chatId, leagueCode);
  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueChangesCallback(bot, query) {
  const chatId = query.message.chat.id;
  const leagueCode = query.data.split(':')[1];

  await sendLeagueChanges(bot, chatId, leagueCode);
  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueUnfollowCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const leagueCode = query.data.split(':')[1];

  try {
    const result = await unfollowLeague({ chatId, leagueCode });
    await bot.editMessageText(
      result.summary,
      { chat_id: chatId, message_id: messageId },
    );
  } catch (err) {
    console.error('Error unfollowing league:', err);
    await bot.editMessageText(
      t('❌ Failed to unfollow league. Please try again.', chatId),
      { chat_id: chatId, message_id: messageId },
    );
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueGraphCallback(bot, query) {
  const chatId = query.message.chat.id;
  const leagueCode = query.data.split(':')[1];

  // Old behavior: render gap-to-leader immediately. New behavior: ask the
  // user which graph type they want (gap vs budget) for the chosen league.
  await sendGraphTypePicker(bot, chatId, leagueCode);
  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueGraphTypeCallback(bot, query) {
  const chatId = query.message.chat.id;
  const [, graphType, leagueCode] = query.data.split(':');

  if (graphType === LEAGUE_GRAPH_TYPES.BUDGET) {
    await sendLeagueBudgetGraph(bot, chatId, leagueCode);
  } else if (graphType === LEAGUE_GRAPH_TYPES.STANDINGS) {
    await sendLeagueStandingsGraph(bot, chatId, leagueCode);
  } else {
    // Default to the gap-to-leader chart for any unknown/legacy type value.
    await sendLeagueGraph(bot, chatId, leagueCode);
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleRaceSummaryCallback(bot, query) {
  const chatId = query.message.chat.id;
  const leagueCode = query.data.split(':').slice(1).join(':');
  await bot.answerCallbackQuery(query.id);

  return sendRaceSummary(bot, chatId, leagueCode);
}
