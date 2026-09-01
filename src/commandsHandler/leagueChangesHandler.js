const { t } = require('../i18n');
const { listUserLeagues } = require('../leagueRegistryService');
const {
  getLockedTeamsData,
  getLeagueTeamsData,
} = require('../azureStorageService');
const {
  COMMAND_FOLLOW_LEAGUE,
  LEAGUE_CHANGES_CALLBACK_TYPE,
} = require('../constants');
const {
  compareLeagueChanges,
  compareTeamChanges,
} = require('../cores/leagueChangesCore');

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

/**
 * Diff a single team between two locked snapshots.
 * @returns {{lines: string[], hasChanges: boolean}} HTML-safe lines describing
 *   the diff. `hasChanges` is true iff at least one line was produced.
 */
function diffTeam(latestTeam, previousTeam, chatId) {
  const lines = [];
  const changes = compareTeamChanges(latestTeam, previousTeam);

  if (changes.isNew) {
    lines.push(`↪ ${t('🆕 new team', chatId)}`);

    return { lines, hasChanges: true };
  }

  if (changes.drivers.in.length || changes.drivers.out.length) {
    const parts = [
      ...changes.drivers.out.map((name) => `-${escapeHtml(name)}`),
      ...changes.drivers.in.map((name) => `+${escapeHtml(name)}`),
    ];
    lines.push(`↪ ${parts.join(' ')}`);
  }

  if (changes.constructors.in.length || changes.constructors.out.length) {
    const parts = [
      ...changes.constructors.out.map((name) => `-${escapeHtml(name)}`),
      ...changes.constructors.in.map((name) => `+${escapeHtml(name)}`),
    ];
    lines.push(`↪ ${parts.join(' ')}`);
  }

  if (changes.captain) {
    lines.push(
      t('↪ Captain: {FROM} → {TO}', chatId, {
        FROM: escapeHtml(changes.captain.from || '—'),
        TO: escapeHtml(changes.captain.to || '—'),
      }),
    );
  }

  if (changes.megaCaptain) {
    lines.push(
      t('↪ Mega captain: {FROM} → {TO}', chatId, {
        FROM: escapeHtml(changes.megaCaptain.from || '—'),
        TO: escapeHtml(changes.megaCaptain.to || '—'),
      }),
    );
  }

  for (const chipName of changes.chipsActivated) {
    lines.push(
      t('↪ Chip: {CHIP}', chatId, { CHIP: escapeHtml(chipName) }),
    );
  }

  return { lines, hasChanges: lines.length > 0 };
}

/**
 * Build the rendered HTML message.
 * @param {Object} latest  parsed locked-snapshot blob (after-state)
 * @param {Object} previous  parsed teams-data blob (before-state, same matchday)
 * @param {number|string} chatId
 */
function formatLeagueChanges(latest, previous, chatId) {
  const result = compareLeagueChanges({ latest, planning: previous });
  const blocks = [];

  for (const team of result.changedTeams) {
    const lines = [];
    if (team.isNew) {
      lines.push(`↪ ${t('🆕 new team', chatId)}`);
    } else {
      if (team.drivers.in.length || team.drivers.out.length) {
        lines.push(
          `↪ ${[
            ...team.drivers.out.map((name) => `-${escapeHtml(name)}`),
            ...team.drivers.in.map((name) => `+${escapeHtml(name)}`),
          ].join(' ')}`,
        );
      }
      if (team.constructors.in.length || team.constructors.out.length) {
        lines.push(
          `↪ ${[
            ...team.constructors.out.map((name) => `-${escapeHtml(name)}`),
            ...team.constructors.in.map((name) => `+${escapeHtml(name)}`),
          ].join(' ')}`,
        );
      }
      if (team.captain) {
        lines.push(
          t('↪ Captain: {FROM} → {TO}', chatId, {
            FROM: escapeHtml(team.captain.from || '—'),
            TO: escapeHtml(team.captain.to || '—'),
          }),
        );
      }
      if (team.megaCaptain) {
        lines.push(
          t('↪ Mega captain: {FROM} → {TO}', chatId, {
            FROM: escapeHtml(team.megaCaptain.from || '—'),
            TO: escapeHtml(team.megaCaptain.to || '—'),
          }),
        );
      }
      for (const chipName of team.chipsActivated) {
        lines.push(
          t('↪ Chip: {CHIP}', chatId, { CHIP: escapeHtml(chipName) }),
        );
      }
    }
    const headerName = `${positionPrefix(team.position)}<b>${escapeHtml(team.teamName || team.userName || '—')}</b>`;
    blocks.push([headerName, ...lines].join('\n'));
  }

  const header = t('🔄 {LEAGUE} — matchday {N} (planning → locked)', chatId, {
    LEAGUE: escapeHtml(latest.leagueName || latest.leagueCode),
    N: latest.matchdayId ?? '?',
  });

  if (blocks.length === 0) {
    return [
      header,
      '',
      t('No team changes for matchday {N}.', chatId, {
        N: latest.matchdayId ?? '?',
      }),
    ].join('\n');
  }

  const tail =
    result.unchangedTeams.length > 0
      ? `\n\n${t('({COUNT} other team(s) had no changes)', chatId, { COUNT: result.unchangedTeams.length })}`
      : '';

  return `${header}\n\n${blocks.join('\n\n')}${tail}`;
}

async function sendLeagueChanges(bot, chatId, leagueCode) {
  let latest;
  let teamsData;
  try {
    [latest, teamsData] = await Promise.all([
      getLockedTeamsData(leagueCode),
      getLeagueTeamsData(leagueCode),
    ]);
  } catch (err) {
    console.error('Error fetching league snapshots:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  const comparison = compareLeagueChanges({ latest, planning: teamsData });

  if (comparison.status === 'missing_locked') {
    await bot.sendMessage(
      chatId,
      t(
        'No locked-roster snapshots are available yet for this league. Wait until the next race weekend.',
        chatId,
      ),
    );

    return;
  }

  if (comparison.status === 'missing_planning') {
    await bot.sendMessage(
      chatId,
      t(
        'League data is not yet available. Wait for the next weekly refresh.',
        chatId,
      ),
    );

    return;
  }

  if (comparison.status === 'matchday_mismatch') {
    await bot.sendMessage(
      chatId,
      t(
        'The latest locked snapshot is for matchday {LOCKED_MD} but the weekly snapshot is for matchday {TEAMS_MD}. Wait for the next session lock.',
        chatId,
        {
          LOCKED_MD: comparison.lockedMatchdayId ?? '?',
          TEAMS_MD: comparison.planningMatchdayId ?? '?',
        },
      ),
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    formatLeagueChanges(latest, teamsData, chatId),
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
