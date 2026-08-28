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

async function inspectLeagueFollow({ chatId, leagueCode }) {
  const normalizedCode = normalizeLeagueCode(leagueCode);
  if (!/^[A-Z0-9]{3,20}$/.test(normalizedCode)) {
    return invalidLeagueCodeResult(chatId, normalizedCode);
  }

  const leagueData = await getLeagueData(normalizedCode);
  if (!leagueData) {
    return {
      status: STATUS.NOT_FOUND,
      summary: t('League "{CODE}" was not found.', chatId, {
        CODE: normalizedCode,
      }),
      leagueCode: normalizedCode,
    };
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

async function followLeague({ chatId, leagueCode }) {
  const inspected = await inspectLeagueFollow({ chatId, leagueCode });
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

module.exports = {
  normalizeLeagueCode,
  inspectLeagueFollow,
  followLeague,
  STATUS,
};
