const {
  getLiveScoreData,
  getLockedTeamsData,
} = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { getSelectedTeam } = require('../cache');
const {
  sanitizeTeamName,
  buildLeagueTeamId,
} = require('../utils/teamId');
const {
  mapLockedTeamForScoring,
  calculateLiveScoreBreakdown,
  deriveLiveScoreOptions,
} = require('../utils/liveScoreCalc');
const { t } = require('../i18n');
const { formatDateTime, sendErrorMessage } = require('../utils');
const {
  COMMAND_FOLLOW_LEAGUE,
  LIVE_SCORE_CALLBACK_TYPE,
  LIVE_SCORE_ACTIONS,
} = require('../constants');

const SESSION_METRICS = ['POS', 'PG', 'OV', 'FL', 'DD', 'TW', 'FP'];
const SESSION_ORDER = ['Sprint', 'Qualifying', 'Race'];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Map a single locked-snapshot team entry to the `{drivers, constructors,
 * boostDriver, extraBoostDriver}` shape consumed by
 * `calculateLiveScoreBreakdown`. Names are mapped to bot codes via
 * `mapNameToCode`; captain / mega-captain are identified by the
 * per-driver `isCaptain` / `isMegaCaptain` flags.
 *
 * Phase-5 NOTE: implementation moved to `src/utils/liveScoreCalc.js`.
 * Kept here only as a re-export for back-compat with the handler's test
 * which imports it directly from this module.
 */

function formatSignedDelta(value) {
  const numericValue = Number(value) || 0;

  return `${numericValue >= 0 ? '+' : ''}${numericValue}`;
}

function formatSessionBreakdown(sessionName, sessionData = {}, chatId) {
  const metrics = SESSION_METRICS.reduce((acc, metricKey) => {
    if (!Object.prototype.hasOwnProperty.call(sessionData, metricKey)) {
      return acc;
    }

    const metricValue = sessionData[metricKey];
    if (metricValue === 0) {
      return acc;
    }

    acc.push(`${metricKey} ${metricValue}`);

    return acc;
  }, []);

  if (metrics.length === 0) {
    return null;
  }

  return `${t(sessionName, chatId)}: ${metrics.join(', ')}`;
}

function formatMemberLine(
  { code, points, priceChange, details, isBoost, isExtraBoost },
  chatId,
) {
  const effectivePoints = isExtraBoost ? points * 3 : isBoost ? points * 2 : points;
  const boostLabel = isExtraBoost
    ? ` (${t('Extra Boost', chatId)} x3)`
    : isBoost
      ? ` (${t('Boost x2', chatId)})`
      : '';
  const sessionLines = SESSION_ORDER.map((sessionName) =>
    formatSessionBreakdown(sessionName, details[sessionName], chatId),
  ).filter(Boolean);

  return [
    `<b>${code}${boostLabel} — ${effectivePoints} ${t('pts', chatId)} | Δ ${formatSignedDelta(
      priceChange,
    )}</b>`,
    ...sessionLines,
  ].join('\n');
}

function joinMembersWithEmptyLine(members, chatId) {
  return members.map((member) => formatMemberLine(member, chatId)).join('\n\n');
}

// `getLiveMemberData`, `calculateLiveScoreBreakdown`, and
// `deriveLiveScoreOptions` were moved to `src/utils/liveScoreCalc.js`
// in Phase 5 — see top-of-file require. Module.exports below still
// re-exports `calculateLiveScoreBreakdown` / `deriveLiveScoreOptions` /
// `mapLockedTeamForScoring` for back-compat with this handler's test.

function callbackData(action, ...payload) {
  return [LIVE_SCORE_CALLBACK_TYPE, action, ...payload].join(':');
}

function formatLiveScoreSummary({
  leagueName,
  matchdayId,
  teamName,
  liveScoreData,
  breakdown,
  chatId,
}) {
  const {
    totalPoints,
    pointsBeforePenalty,
    transferPenalty,
    noNegativeApplied,
    totalPriceChange,
    driverBreakdown,
    constructorBreakdown,
    missingMembers,
  } = breakdown;

  const extractedAt = new Date(liveScoreData.extractedAt);
  let formattedUpdate = String(liveScoreData.extractedAt || '-');
  if (!Number.isNaN(extractedAt.getTime())) {
    const { dateStr, timeStr } = formatDateTime(extractedAt, chatId);
    formattedUpdate = `${dateStr}, ${timeStr}`;
  }

  const headerLeague = escapeHtml(leagueName);
  const headerTeam = escapeHtml(teamName);
  const messageParts = [
    `<b>🏎️ ${t('Live Score', chatId)} — ${headerLeague} — ${t('md {N}', chatId, { N: matchdayId ?? '?' })} — ${headerTeam}</b>`,
    `<b>${t('Updated At', chatId)}:</b> ${formattedUpdate}`,
    `<b>${t('Total Live Points', chatId)}:</b> ${totalPoints.toFixed(2)}`,
  ];

  if (transferPenalty > 0) {
    messageParts.push(
      `<b>${t('Transfer Penalty', chatId)}:</b> -${transferPenalty.toFixed(2)} (${t('Pre-penalty', chatId)}: ${pointsBeforePenalty.toFixed(2)})`,
    );
  }

  messageParts.push(
    `<b>${t('Total Live Price Change', chatId)}:</b> ${totalPriceChange.toFixed(2)}`,
  );

  if (noNegativeApplied) {
    messageParts.push(`<i>🛡️ ${t('No Negative chip active', chatId)}</i>`);
  }

  messageParts.push(
    '',
    `<b>👤 ${t('Live Drivers', chatId)}</b>`,
    joinMembersWithEmptyLine(driverBreakdown, chatId),
    '',
    '',
    `<b>🛠️ ${t('Live Constructors', chatId)}</b>`,
    joinMembersWithEmptyLine(constructorBreakdown, chatId),
  );

  if (missingMembers.length > 0) {
    messageParts.push(
      '',
      `⚠️ ${t('Missing live data for: {MEMBERS}', chatId, {
        MEMBERS: missingMembers.join(', '),
      })}`,
    );
  }

  return messageParts.join('\n');
}

function formatAllTeamsLeaderboard({
  leagueName,
  matchdayId,
  rows,
  liveScoreData,
  chatId,
  selectedTeamId,
}) {
  const extractedAt = new Date(liveScoreData.extractedAt);
  let formattedUpdate = String(liveScoreData.extractedAt || '-');
  if (!Number.isNaN(extractedAt.getTime())) {
    const { dateStr, timeStr } = formatDateTime(extractedAt, chatId);
    formattedUpdate = `${dateStr}, ${timeStr}`;
  }

  const allTeamsLabel = t('All teams', chatId);
  const header = `<b>🏎️ ${t('Live Score', chatId)} — ${escapeHtml(leagueName)} — ${t('md {N}', chatId, { N: matchdayId ?? '?' })} — ${escapeHtml(allTeamsLabel)}</b>`;
  const updatedLine = `<b>${t('Updated At', chatId)}:</b> ${formattedUpdate}`;

  if (rows.length === 0) {
    return [
      header,
      updatedLine,
      '',
      t('No teams in this league yet.', chatId),
    ].join('\n');
  }

  const maxRank = rows.length;
  const rankWidth = String(maxRank).length;

  const lines = rows.map((row, idx) => {
    const rank = String(idx + 1).padStart(rankWidth, ' ');
    const teamId = buildLeagueTeamId(row.userName, row.teamNo);
    const isSelected = !!teamId && teamId === selectedTeamId;
    const penaltyMarker = row.transferPenalty > 0 ? ' †' : '';
    const text = ` ${rank}. ${escapeHtml(row.teamName || row.userName || '—')} — ${row.totalPoints.toFixed(2)} ${t('pts', chatId)} | Δ ${formatSignedDelta(row.totalPriceChange.toFixed(2))}${penaltyMarker}`;

    return isSelected ? `<b>${text}</b>` : text;
  });

  const tail = rows.some((row) => row.transferPenalty > 0)
    ? ['', `<i>${t('† transfer penalty applied', chatId)}</i>`]
    : [];

  return [header, updatedLine, '', ...lines, ...tail].join('\n');
}

async function sendTeamPicker(bot, chatId, leagueCode, msg) {
  let snapshot;
  try {
    snapshot = await getLockedTeamsData(leagueCode);
  } catch (err) {
    console.error('Error fetching locked snapshot for team picker:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, { ERROR: err.message }),
    );

    return;
  }

  if (!snapshot || !Array.isArray(snapshot.teams) || snapshot.teams.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'No locked roster is available yet for this league. Wait for the next session lock.',
        chatId,
      ),
    );

    return;
  }

  const teams = [...snapshot.teams].sort(
    (a, b) => (a.position || Infinity) - (b.position || Infinity),
  );

  const allTeamsButton = [
    {
      text: `🏁 ${t('All teams', chatId)}`,
      callback_data: callbackData(LIVE_SCORE_ACTIONS.ALL, leagueCode),
    },
  ];
  const teamButtons = teams.map((team) => [
    {
      text: `${team.position ?? '?'}. ${team.teamName || team.userName || '—'}`,
      callback_data: callbackData(
        LIVE_SCORE_ACTIONS.TEAM,
        leagueCode,
        sanitizeTeamName(team.teamName || team.userName || 'team'),
      ),
    },
  ]);

  await bot.sendMessage(
    chatId,
    t("Which team's live score do you want to see?", chatId),
    {
      reply_to_message_id: msg?.message_id,
      reply_markup: { inline_keyboard: [allTeamsButton, ...teamButtons] },
    },
  );
}

async function sendLiveScoreForTeam(bot, chatId, leagueCode, slug) {
  let snapshot;
  let liveScoreData;
  try {
    [snapshot, liveScoreData] = await Promise.all([
      getLockedTeamsData(leagueCode),
      getLiveScoreData(),
    ]);
  } catch (error) {
    console.error('Error fetching live score data:', error);
    await sendErrorMessage(bot, `Error fetching live score: ${error.message}`);
    await bot.sendMessage(
      chatId,
      t('❌ Error fetching live score: {ERROR}', chatId, { ERROR: error.message }),
    );

    return;
  }

  if (!snapshot || !Array.isArray(snapshot.teams)) {
    await bot.sendMessage(
      chatId,
      t(
        'No locked roster is available yet for this league. Wait for the next session lock.',
        chatId,
      ),
    );

    return;
  }

  const match = snapshot.teams.find(
    (team) => sanitizeTeamName(team.teamName || team.userName || 'team') === slug,
  );
  if (!match) {
    await bot.sendMessage(
      chatId,
      t('Team {TEAM} not found in the latest locked snapshot.', chatId, {
        TEAM: slug,
      }),
    );

    return;
  }

  const realTeam = mapLockedTeamForScoring(match);
  const options = deriveLiveScoreOptions(match);
  const breakdown = calculateLiveScoreBreakdown(realTeam, liveScoreData, options);
  const message = formatLiveScoreSummary({
    leagueName: snapshot.leagueName || leagueCode,
    matchdayId: snapshot.matchdayId,
    teamName: match.teamName || match.userName || '—',
    liveScoreData,
    breakdown,
    chatId,
  });

  await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

async function sendLiveScoreForAllTeams(bot, chatId, leagueCode) {
  let snapshot;
  let liveScoreData;
  try {
    [snapshot, liveScoreData] = await Promise.all([
      getLockedTeamsData(leagueCode),
      getLiveScoreData(),
    ]);
  } catch (error) {
    console.error('Error fetching all-teams live score:', error);
    await sendErrorMessage(bot, `Error fetching live score: ${error.message}`);
    await bot.sendMessage(
      chatId,
      t('❌ Error fetching live score: {ERROR}', chatId, { ERROR: error.message }),
    );

    return;
  }

  if (!snapshot || !Array.isArray(snapshot.teams)) {
    await bot.sendMessage(
      chatId,
      t(
        'No locked roster is available yet for this league. Wait for the next session lock.',
        chatId,
      ),
    );

    return;
  }

  const rows = snapshot.teams.map((team) => {
    const realTeam = mapLockedTeamForScoring(team);
    const options = deriveLiveScoreOptions(team);
    const { totalPoints, totalPriceChange, transferPenalty } =
      calculateLiveScoreBreakdown(realTeam, liveScoreData, options);

    return {
      teamName: team.teamName,
      userName: team.userName,
      teamNo: team.teamNo,
      position: team.position,
      totalPoints,
      totalPriceChange,
      transferPenalty,
    };
  });

  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    return b.totalPriceChange - a.totalPriceChange;
  });

  const message = formatAllTeamsLeaderboard({
    leagueName: snapshot.leagueName || leagueCode,
    matchdayId: snapshot.matchdayId,
    rows,
    liveScoreData,
    chatId,
    selectedTeamId: getSelectedTeam(chatId),
  });

  await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

async function handleLiveScoreCommand(bot, msg) {
  const chatId = msg.chat.id;

  let leagues;
  try {
    leagues = await listUserLeagues(chatId);
  } catch (err) {
    console.error('Error listing user leagues:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load your leagues: {ERROR}', chatId, { ERROR: err.message }),
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
    await sendTeamPicker(bot, chatId, leagues[0].leagueCode, msg);

    return;
  }

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: callbackData(LIVE_SCORE_ACTIONS.LEAGUE, league.leagueCode),
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league live score do you want to see?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

async function handleLiveScoreCallback(bot, query) {
  const chatId = query.message.chat.id;
  const parts = (query.data || '').split(':');
  // parts[0] = LIVE_SCORE_CALLBACK_TYPE
  const action = parts[1];
  const leagueCode = parts[2];

  try {
    if (action === LIVE_SCORE_ACTIONS.LEAGUE) {
      await sendTeamPicker(bot, chatId, leagueCode, query.message);
    } else if (action === LIVE_SCORE_ACTIONS.TEAM) {
      const slug = parts.slice(3).join(':');
      await sendLiveScoreForTeam(bot, chatId, leagueCode, slug);
    } else if (action === LIVE_SCORE_ACTIONS.ALL) {
      await sendLiveScoreForAllTeams(bot, chatId, leagueCode);
    }
  } finally {
    try {
      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error('Error answering live-score callback:', err);
    }
  }
}

module.exports = {
  handleLiveScoreCommand,
  handleLiveScoreCallback,
  calculateLiveScoreBreakdown,
  deriveLiveScoreOptions,
  formatMemberLine,
  formatSessionBreakdown,
  formatLiveScoreSummary,
  formatAllTeamsLeaderboard,
  mapLockedTeamForScoring,
  sendTeamPicker,
  sendLiveScoreForTeam,
  sendLiveScoreForAllTeams,
};
