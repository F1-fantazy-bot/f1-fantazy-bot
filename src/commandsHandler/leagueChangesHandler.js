const { t } = require('../i18n');
const { listUserLeagues } = require('../leagueRegistryService');
const {
  getLockedTeamsData,
  listLockedMatchdays,
} = require('../azureStorageService');
const {
  COMMAND_FOLLOW_LEAGUE,
  LEAGUE_CHANGES_CALLBACK_TYPE,
} = require('../constants');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function positionPrefix(position) {
  if (position === 1) {
    return '🥇 ';
  }
  if (position === 2) {
    return '🥈 ';
  }
  if (position === 3) {
    return '🥉 ';
  }

  return Number.isFinite(position) ? `${position}. ` : '';
}

function pickCaptainName(team, key) {
  const drivers = Array.isArray(team?.drivers) ? team.drivers : [];
  const match = drivers.find((d) => d?.[key]);

  return match?.name || null;
}

function findChipDelta(latestChips, previousChips) {
  const previousNames = new Set(
    (Array.isArray(previousChips) ? previousChips : []).map((c) => c?.name),
  );

  return (Array.isArray(latestChips) ? latestChips : [])
    .map((c) => c?.name)
    .filter((name) => name && !previousNames.has(name));
}

/**
 * Diff a single team between two locked snapshots.
 * @returns {{lines: string[], hasChanges: boolean}} HTML-safe lines describing
 *   the diff. `hasChanges` is true iff at least one line was produced.
 */
function diffTeam(latestTeam, previousTeam, chatId) {
  const lines = [];

  if (!previousTeam) {
    lines.push(`↪ ${t('🆕 new team', chatId)}`);

    return { lines, hasChanges: true };
  }

  const prevDriverNames = new Set(
    (previousTeam.drivers || []).map((d) => d.name).filter(Boolean),
  );
  const latestDriverNames = new Set(
    (latestTeam.drivers || []).map((d) => d.name).filter(Boolean),
  );
  const driversIn = [...latestDriverNames].filter((n) => !prevDriverNames.has(n));
  const driversOut = [...prevDriverNames].filter((n) => !latestDriverNames.has(n));

  const prevConstructorNames = new Set(
    (previousTeam.constructors || []).map((c) => c.name).filter(Boolean),
  );
  const latestConstructorNames = new Set(
    (latestTeam.constructors || []).map((c) => c.name).filter(Boolean),
  );
  const constructorsIn = [...latestConstructorNames].filter(
    (n) => !prevConstructorNames.has(n),
  );
  const constructorsOut = [...prevConstructorNames].filter(
    (n) => !latestConstructorNames.has(n),
  );

  if (driversIn.length || driversOut.length) {
    const parts = [
      ...driversOut.map((n) => `-${escapeHtml(n)}`),
      ...driversIn.map((n) => `+${escapeHtml(n)}`),
    ];
    lines.push(`↪ ${parts.join(' ')}`);
  }

  if (constructorsIn.length || constructorsOut.length) {
    const parts = [
      ...constructorsOut.map((n) => `-${escapeHtml(n)}`),
      ...constructorsIn.map((n) => `+${escapeHtml(n)}`),
    ];
    lines.push(`↪ ${parts.join(' ')}`);
  }

  const prevCaptain = pickCaptainName(previousTeam, 'isCaptain');
  const latestCaptain = pickCaptainName(latestTeam, 'isCaptain');
  if (prevCaptain !== latestCaptain) {
    lines.push(
      t('↪ Captain: {FROM} → {TO}', chatId, {
        FROM: escapeHtml(prevCaptain || '—'),
        TO: escapeHtml(latestCaptain || '—'),
      }),
    );
  }

  const prevMega = pickCaptainName(previousTeam, 'isMegaCaptain');
  const latestMega = pickCaptainName(latestTeam, 'isMegaCaptain');
  if (prevMega !== latestMega) {
    lines.push(
      t('↪ Mega captain: {FROM} → {TO}', chatId, {
        FROM: escapeHtml(prevMega || '—'),
        TO: escapeHtml(latestMega || '—'),
      }),
    );
  }

  const newChips = findChipDelta(latestTeam.chipsUsed, previousTeam.chipsUsed);
  for (const chipName of newChips) {
    lines.push(
      t('↪ Chip: {CHIP}', chatId, { CHIP: escapeHtml(chipName) }),
    );
  }

  return { lines, hasChanges: lines.length > 0 };
}

/**
 * Build the rendered HTML message.
 * @param {Object} latest  parsed locked-snapshot blob (the newer one)
 * @param {Object} previous  parsed locked-snapshot blob (the older one)
 * @param {number|string} chatId
 */
function formatLeagueChanges(latest, previous, chatId) {
  const latestTeams = Array.isArray(latest.teams) ? latest.teams : [];
  const previousByUser = new Map();
  for (const team of Array.isArray(previous.teams) ? previous.teams : []) {
    if (team?.userName) {
      previousByUser.set(team.userName, team);
    }
  }

  const sortedLatest = [...latestTeams].sort(
    (a, b) => (a.position || Infinity) - (b.position || Infinity),
  );

  const blocks = [];
  let unchanged = 0;

  for (const team of sortedLatest) {
    const previousTeam = previousByUser.get(team.userName);
    const { lines, hasChanges } = diffTeam(team, previousTeam, chatId);
    if (!hasChanges) {
      unchanged += 1;
      continue;
    }
    const headerName = `${positionPrefix(team.position)}<b>${escapeHtml(team.teamName || team.userName || '—')}</b>`;
    blocks.push([headerName, ...lines].join('\n'));
  }

  const header = t('🔄 {LEAGUE} — matchday {PREV} → {LATEST}', chatId, {
    LEAGUE: escapeHtml(latest.leagueName || latest.leagueCode),
    PREV: previous.matchdayId ?? '?',
    LATEST: latest.matchdayId ?? '?',
  });

  if (blocks.length === 0) {
    return [
      header,
      '',
      t('No team changes between matchday {PREV} and {LATEST}.', chatId, {
        PREV: previous.matchdayId ?? '?',
        LATEST: latest.matchdayId ?? '?',
      }),
    ].join('\n');
  }

  const tail =
    unchanged > 0
      ? `\n\n${t('({COUNT} other team(s) had no changes)', chatId, { COUNT: unchanged })}`
      : '';

  return `${header}\n\n${blocks.join('\n\n')}${tail}`;
}

async function sendLeagueChanges(bot, chatId, leagueCode) {
  let matchdayIds;
  try {
    matchdayIds = await listLockedMatchdays(leagueCode);
  } catch (err) {
    console.error('Error listing locked matchdays:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!matchdayIds || matchdayIds.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'No locked-roster snapshots are available yet for this league. Wait until the next race weekend.',
        chatId,
      ),
    );

    return;
  }

  if (matchdayIds.length === 1) {
    await bot.sendMessage(
      chatId,
      t(
        'Only one locked snapshot is available so far (matchday {MD}). At least two are needed to show changes.',
        chatId,
        { MD: matchdayIds[0] },
      ),
    );

    return;
  }

  const latestId = matchdayIds[matchdayIds.length - 1];
  const previousId = matchdayIds[matchdayIds.length - 2];

  let latest;
  let previous;
  try {
    [latest, previous] = await Promise.all([
      getLockedTeamsData(leagueCode, latestId),
      getLockedTeamsData(leagueCode, previousId),
    ]);
  } catch (err) {
    console.error('Error fetching locked snapshots:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!latest || !previous) {
    await bot.sendMessage(
      chatId,
      t(
        'No locked-roster snapshots are available yet for this league. Wait until the next race weekend.',
        chatId,
      ),
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    formatLeagueChanges(latest, previous, chatId),
    { parse_mode: 'HTML' },
  );
}

async function handleLeagueChangesCommand(bot, msg) {
  const chatId = msg.chat.id;

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
    await sendLeagueChanges(bot, chatId, leagues[0].leagueCode);

    return;
  }

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: `${LEAGUE_CHANGES_CALLBACK_TYPE}:${league.leagueCode}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league changes do you want to see?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

module.exports = {
  handleLeagueChangesCommand,
  sendLeagueChanges,
  formatLeagueChanges,
  diffTeam,
};
