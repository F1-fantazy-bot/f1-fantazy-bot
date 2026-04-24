const azureStorageService = require('./azureStorageService');
const { updateUserAttributes } = require('./userRegistryService');
const {
  currentTeamCache,
  getPrintableCache,
  bestTeamsCache,
  userCache,
  normalizeBestTeamBudgetChangePointsPerMillion,
  clearSelectedBestTeam,
  serializeSelectedBestTeamByTeam,
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
  LEAGUE_TEAM_SELECT_CALLBACK_TYPE,
  LEAGUE_TEAM_PICK_CALLBACK_TYPE,
  LEAGUE_TEAM_UNFOLLOW_CALLBACK_TYPE,
  LEAGUE_TEAM_UNFOLLOW_AND_ADD_CALLBACK_TYPE,
  MANAGE_TRACKING_LEAGUE_CALLBACK_TYPE,
  MANAGE_TRACKING_TOGGLE_CALLBACK_TYPE,
  MANAGE_TRACKING_BACK_CALLBACK_TYPE,
  MANAGE_TRACKING_SAVE_CALLBACK_TYPE,
  LEAGUE_GRAPH_CALLBACK_TYPE,
  LEAGUE_GRAPH_TYPE_CALLBACK_TYPE,
  LEAGUE_GRAPH_TYPES,
} = require('./constants');

const {
  sendLogMessage,
  sendMessageToUser,
} = require('./utils');
const {
  ensureSourceIsScreenshot,
} = require('./utils/teamSourceSwitcher');
const { handleMenuCallback } = require('./commandsHandler/menuHandler');
const { t, setLanguage, getLanguageName } = require('./i18n');
const {
  BEST_TEAM_RANKING_PRESETS,
} = require('./commandsHandler/setBestTeamRankingHandler');
const {
  getDeadlinePayload,
  getRefreshMarkup,
} = require('./commandsHandler/deadlineHandler');
const {
  sendLeaderboard,
} = require('./commandsHandler/leaderboardHandler');
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
const { removeUserLeague, listUserLeagues } = require('./leagueRegistryService');
const {
  promptTeamPick,
  applyLeagueTeamSelection,
} = require('./commandsHandler/selectTeamFromLeagueHandler');
const {
  removeFollowedTeam,
} = require('./commandsHandler/unfollowTeamHandler');
const {
  buildManageTrackingTeamsMessage,
  togglePendingTrackedTeam,
  savePendingTrackedTeams,
} = require('./commandsHandler/manageTrackingHandler');

exports.handleCallbackQuery = async function (bot, query) {
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
    case LEAGUE_TEAM_SELECT_CALLBACK_TYPE:
      return await handleLeagueTeamSelectCallback(bot, query);
    case LEAGUE_TEAM_PICK_CALLBACK_TYPE:
      return await handleLeagueTeamPickCallback(bot, query);
    case LEAGUE_TEAM_UNFOLLOW_CALLBACK_TYPE:
      return await handleLeagueTeamUnfollowCallback(bot, query);
    case LEAGUE_TEAM_UNFOLLOW_AND_ADD_CALLBACK_TYPE:
      return await handleLeagueTeamUnfollowAndAddCallback(bot, query);
    case MANAGE_TRACKING_LEAGUE_CALLBACK_TYPE:
      return await handleManageTrackingLeagueCallback(bot, query);
    case MANAGE_TRACKING_TOGGLE_CALLBACK_TYPE:
      return await handleManageTrackingToggleCallback(bot, query);
    case MANAGE_TRACKING_BACK_CALLBACK_TYPE:
      return await handleManageTrackingBackCallback(bot, query);
    case MANAGE_TRACKING_SAVE_CALLBACK_TYPE:
      return await handleManageTrackingSaveCallback(bot, query);
    case LEAGUE_GRAPH_CALLBACK_TYPE:
      return await handleLeagueGraphCallback(bot, query);
    case LEAGUE_GRAPH_TYPE_CALLBACK_TYPE:
      return await handleLeagueGraphTypeCallback(bot, query);
    default:
      await sendLogMessage(bot, `Unknown callback type: ${callbackType}`);
  }
};



function isTelegramMessageNotModifiedError(error) {
  const description =
    error?.response?.body?.description ||
    error?.message ||
    '';

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

  setLanguage(lang, chatId);
  await updateUserAttributes(chatId, { lang });

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

  const preset = BEST_TEAM_RANKING_PRESETS.find((option) => option.id === presetId);

  if (!preset) {
    await bot.answerCallbackQuery(query.id);

    return;
  }

  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  const bestTeamBudgetChangePointsPerMillion =
    normalizeBestTeamBudgetChangePointsPerMillion(
      userCache[key].bestTeamBudgetChangePointsPerMillion,
    );

  bestTeamBudgetChangePointsPerMillion[teamId] =
    preset.budgetChangePointsPerMillion;
  userCache[key].bestTeamBudgetChangePointsPerMillion =
    bestTeamBudgetChangePointsPerMillion;
  const selectedBestTeamByTeam = clearSelectedBestTeam(chatId, teamId);

  await updateUserAttributes(chatId, {
    bestTeamBudgetChangePointsPerMillion: JSON.stringify(
      bestTeamBudgetChangePointsPerMillion,
    ),
    selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
      selectedBestTeamByTeam,
    ),
  });

  // Invalidate cached best teams for this team because ranking logic changed
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  const confirmationMessage =
    `${t(
      'Best-team ranking set: {LABEL} ({VALUE} pts per 1M per remaining race).',
      chatId,
      {
        LABEL: t(preset.labelKey, chatId),
        VALUE: preset.budgetChangePointsPerMillion,
      },
    )}
` +
    t(
      'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.',
      chatId,
      { CMD: '/best_teams' },
    );

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

  // Update selection in memory
  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedTeam = teamId;

  // Persist selection
  await updateUserAttributes(chatId, { selectedTeam: teamId });

  // Edit message to confirm
  await bot.editMessageText(
    t('Active team switched to {TEAM}.', chatId, { TEAM: teamId }),
    { chat_id: chatId, message_id: messageId },
  );
  await bot.answerCallbackQuery(query.id);
}

async function handleTeamAssignCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [_, uniqueKey, teamId] = query.data.split(':');

  // Retrieve temporarily stored team data from Azure Blob Storage
  const teamData = await azureStorageService.getPendingTeamAssignment(
    chatId,
    uniqueKey,
  );
  if (!teamData) {
    await bot.editMessageText(
      t('An error occurred while extracting data from the photo.', chatId),
      { chat_id: chatId, message_id: messageId },
    );
    await bot.answerCallbackQuery(query.id);

    return;
  }
  await azureStorageService.deletePendingTeamAssignment(chatId, uniqueKey);

  // Cross-source rule: adding a screenshot team wipes any followed league teams.
  await ensureSourceIsScreenshot(bot, chatId);

  // Store in cache (team-scoped)
  if (!currentTeamCache[chatId]) {
    currentTeamCache[chatId] = {};
  }
  currentTeamCache[chatId][teamId] = teamData;

  // Persist to blob storage
  await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);

  // Auto-select this team
  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedTeam = teamId;
  const selectedBestTeamByTeam = clearSelectedBestTeam(chatId, teamId);
  await updateUserAttributes(chatId, {
    selectedTeam: teamId,
    selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
      selectedBestTeamByTeam,
    ),
  });

  // Invalidate best teams for this team
  if (bestTeamsCache[chatId]) {
    delete bestTeamsCache[chatId][teamId];
  }

  // Edit message to confirm
  await bot.editMessageText(
    t('Selected Team: {TEAM}', chatId, { TEAM: teamId }),
    { chat_id: chatId, message_id: messageId },
  );

  // Notify about auto-switch
  await sendMessageToUser(
    bot,
    chatId,
    t('🔄 Active team auto-switched to {TEAM}.', chatId, { TEAM: teamId }),
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

async function handleLeagueUnfollowCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const leagueCode = query.data.split(':')[1];

  try {
    await removeUserLeague(chatId, leagueCode);
    await bot.editMessageText(
      t('Unfollowed league {CODE}.', chatId, { CODE: leagueCode }),
      { chat_id: chatId, message_id: messageId },
    );
  } catch (err) {
    console.error('Error unfollowing league:', err);
    await bot.editMessageText(
      t('❌ Failed to unfollow league: {ERROR}', chatId, {
        ERROR: err.message,
      }),
      { chat_id: chatId, message_id: messageId },
    );
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueTeamSelectCallback(bot, query) {
  const chatId = query.message.chat.id;
  const leagueCode = query.data.split(':')[1];

  await promptTeamPick(bot, chatId, leagueCode);
  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueTeamPickCallback(bot, query) {
  const chatId = query.message.chat.id;
  const [, leagueCode, position] = query.data.split(':');

  await applyLeagueTeamSelection(bot, chatId, leagueCode, position);
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

async function handleLeagueTeamUnfollowCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.substring(query.data.indexOf(':') + 1);

  try {
    const { removed } = await removeFollowedTeam(bot, chatId, teamId);
    if (!removed) {
      await bot.editMessageText(
        t('❌ That followed team no longer exists.', chatId),
        { chat_id: chatId, message_id: messageId },
      );
    } else {
      await bot.editMessageText(
        t('✅ Stopped following team {TEAM}.', chatId, { TEAM: teamId }),
        { chat_id: chatId, message_id: messageId },
      );
    }
  } catch (err) {
    console.error('Error in unfollow-team callback:', err);
    await bot.editMessageText(
      t('❌ Failed to stop following team: {ERROR}', chatId, {
        ERROR: err.message,
      }),
      { chat_id: chatId, message_id: messageId },
    );
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleLeagueTeamUnfollowAndAddCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const teamId = query.data.substring(query.data.indexOf(':') + 1);

  let pendingAdd;
  try {
    pendingAdd = await azureStorageService.getPendingLeagueTeamAdd(chatId);
  } catch (err) {
    console.error('Error reading pending league team add:', err);
  }

  try {
    await removeFollowedTeam(bot, chatId, teamId);
  } catch (err) {
    console.error('Error removing team during over-cap unfollow:', err);
    await bot.editMessageText(
      t('❌ Failed to stop following team: {ERROR}', chatId, {
        ERROR: err.message,
      }),
      { chat_id: chatId, message_id: messageId },
    );
    await bot.answerCallbackQuery(query.id);

    return;
  }

  if (!pendingAdd || !pendingAdd.leagueCode) {
    await bot.editMessageText(
      t(
        '❌ The pending team to follow was lost. Please try /select_team_from_league again.',
        chatId,
      ),
      { chat_id: chatId, message_id: messageId },
    );
    await bot.answerCallbackQuery(query.id);

    return;
  }

  await azureStorageService.deletePendingLeagueTeamAdd(chatId);

  await bot.editMessageText(
    t('✅ Stopped following team {TEAM}.', chatId, { TEAM: teamId }),
    { chat_id: chatId, message_id: messageId },
  );

  await applyLeagueTeamSelection(
    bot,
    chatId,
    pendingAdd.leagueCode,
    pendingAdd.position,
  );

  await bot.answerCallbackQuery(query.id);
}

async function handleManageTrackingLeagueCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const leagueCode = query.data.split(':')[1];

  try {
    const payload = await buildManageTrackingTeamsMessage(chatId, leagueCode, true);
    await bot.editMessageText(payload.text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: payload.reply_markup,
    });
  } catch (err) {
    console.error('Error opening manage-tracking teams view:', err);
    await bot.editMessageText(
      t('❌ Failed to load league teams data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
      { chat_id: chatId, message_id: messageId },
    );
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleManageTrackingToggleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [, leagueCode, position] = query.data.split(':');

  try {
    await togglePendingTrackedTeam(chatId, leagueCode, position);

    const payloadAfter = await buildManageTrackingTeamsMessage(chatId, leagueCode, true);
    await bot.editMessageText(payloadAfter.text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: payloadAfter.reply_markup,
    });
  } catch (err) {
    console.error('Error toggling tracked team:', err);
    await bot.answerCallbackQuery(query.id, {
      text: t('❌ Failed to stop following team: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    });

    return;
  }

  await bot.answerCallbackQuery(query.id);
}

async function handleManageTrackingSaveCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const leagueCode = query.data.split(':')[1];

  try {
    const result = await savePendingTrackedTeams(bot, chatId, leagueCode);
    const payload = await buildManageTrackingTeamsMessage(chatId, leagueCode, true);
    await bot.editMessageText(payload.text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: payload.reply_markup,
    });
    await bot.answerCallbackQuery(query.id, {
      text: t('Saved tracking changes. Added: {ADDED}, Removed: {REMOVED}.', chatId, {
        ADDED: result.added,
        REMOVED: result.removed,
      }),
    });
    await bot.sendMessage(chatId, t('✅ Tracking changes saved successfully.', chatId));

    return;
  } catch (err) {
    console.error('Error saving tracked teams:', err);
    await bot.answerCallbackQuery(query.id, {
      text:
        err.message ||
        t('❌ Failed to save tracking changes: {ERROR}', chatId, {
          ERROR: err.message,
        }),
    });

    return;
  }
}

async function handleManageTrackingBackCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  try {
    const leagues = await listUserLeagues(chatId);
    const keyboard = (leagues || []).map((league) => [
      {
        text: league.leagueName || league.leagueCode,
        callback_data: `${MANAGE_TRACKING_LEAGUE_CALLBACK_TYPE}:${league.leagueCode}`,
      },
    ]);
    await bot.editMessageText(
      t('Which league would you like to manage tracked teams for?', chatId),
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard },
      },
    );
  } catch (err) {
    console.error('Error returning to manage-tracking league list:', err);
    await bot.answerCallbackQuery(query.id, {
      text: t('❌ Failed to load your leagues: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    });

    return;
  }

  await bot.answerCallbackQuery(query.id);
}
