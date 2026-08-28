const { t } = require('../i18n');
const { getLeagueData } = require('../azureStorageService');
const {
  addUserLeague,
  getUserLeague,
} = require('../leagueRegistryService');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
});

function normalizeLeagueCode(leagueCode) {
  return typeof leagueCode === 'string'
    ? leagueCode.trim().toUpperCase()
    : '';
}

function invalidLeagueCodeResult(chatId, leagueCode) {
  return {
    status: STATUS.INVALID_INPUT,
    summary: t(
      'League code "{CODE}" is invalid. Use 3-20 letters or numbers.',
      chatId,
      { CODE: leagueCode || '—' },
    ),
    leagueCode,
  };
}

function leagueNotFoundResult(
  chatId,
  leagueCode,
  { surface = 'telegram' } = {},
) {
  const guidance = [
    t('League "{CODE}" was not found.', chatId, {
      CODE: leagueCode,
    }),
    t(
      'To find your league code: go to the F1 Fantasy website, open the league you want to follow, click the share button, and copy the league code from there.',
      chatId,
    ),
    surface === 'agent'
      ? t(
          'If the code is correct but the league is not yet tracked, contact the administrators and send them the league code. This agent cannot submit missing-league reports yet.',
          chatId,
        )
      : t(
          '📩 If the code is correct but the league is not yet tracked, please report it to the admins via /report_bug with the league code and we will add the bot to the league as soon as possible.',
          chatId,
        ),
  ];

  return {
    status: STATUS.NOT_FOUND,
    summary: guidance.join('\n\n'),
    leagueCode,
    followed: false,
    nextSteps: {
      findCode:
        'Open the league on the F1 Fantasy website, use Share, and copy its league code.',
      ...(surface === 'agent'
        ? { contactAdmins: true }
        : { reportCommand: '/report_bug' }),
    },
  };
}

async function inspectLeagueFollow({
  chatId,
  leagueCode,
  surface = 'telegram',
}) {
  const normalizedCode = normalizeLeagueCode(leagueCode);
  if (!/^[A-Z0-9]{3,20}$/.test(normalizedCode)) {
    return invalidLeagueCodeResult(chatId, normalizedCode);
  }

  const leagueData = await getLeagueData(normalizedCode);
  if (!leagueData) {
    return leagueNotFoundResult(chatId, normalizedCode, { surface });
  }
  const leagueName = leagueData.leagueName || normalizedCode;
  const existing = await getUserLeague(chatId, normalizedCode);

  return {
    status: STATUS.OK,
    summary: existing
      ? t('You already follow league "{NAME}" ({CODE}).', chatId, {
          NAME: existing.leagueName || leagueName,
          CODE: normalizedCode,
        })
      : t('Follow league "{NAME}" ({CODE}).', chatId, {
          NAME: leagueName,
          CODE: normalizedCode,
        }),
    leagueCode: normalizedCode,
    leagueName,
    changed: !existing,
  };
}

async function followLeagueInternal({
  chatId,
  leagueCode,
  surface = 'telegram',
}) {
  const inspected = await inspectLeagueFollow({
    chatId,
    leagueCode,
    surface,
  });
  if (inspected.status !== STATUS.OK || !inspected.changed) {
    return inspected;
  }

  await addUserLeague(
    chatId,
    inspected.leagueCode,
    inspected.leagueName,
  );

  return {
    ...inspected,
    summary: t(
      'Now following league "{NAME}" ({CODE}).',
      chatId,
      {
        NAME: inspected.leagueName,
        CODE: inspected.leagueCode,
      },
    ),
  };
}

async function followLeague(args) {
  // Lazy require avoids the activateChipService → selectTeamService cycle.
  const { runChipMutation } = require('./activateChipService');

  return await runChipMutation(args.chatId, () =>
    followLeagueInternal(args),
  );
}

module.exports = {
  normalizeLeagueCode,
  leagueNotFoundResult,
  inspectLeagueFollow,
  followLeague,
  STATUS,
};
