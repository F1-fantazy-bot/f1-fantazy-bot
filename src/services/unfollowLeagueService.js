const { t } = require('../i18n');
const {
  listUserLeagues,
  removeUserLeague,
} = require('../leagueRegistryService');

const STATUS = Object.freeze({
  OK: 'ok',
  NOT_FOUND: 'not_found',
});

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function inspectLeagueUnfollow({ chatId, leagueCode, leagueName }) {
  const leagues = await listUserLeagues(chatId);
  const code = normalize(leagueCode);
  const name = normalize(leagueName);
  const matches = leagues.filter((league) =>
    code
      ? normalize(league.leagueCode) === code
      : name && normalize(league.leagueName) === name,
  );

  if (matches.length !== 1) {
    return {
      status: STATUS.NOT_FOUND,
      summary: t(
        'You are not following that league. Followed leagues: {LEAGUES}.',
        chatId,
        {
          LEAGUES:
            leagues
              .map((league) =>
                `${league.leagueName || league.leagueCode} (${league.leagueCode})`,
              )
              .join(', ') || '—',
        },
      ),
      changed: false,
      followedLeagues: leagues,
    };
  }

  const league = matches[0];

  return {
    status: STATUS.OK,
    summary: t(
      'Unfollow league "{NAME}" ({CODE}).',
      chatId,
      {
        NAME: league.leagueName || league.leagueCode,
        CODE: league.leagueCode,
      },
    ),
    leagueCode: league.leagueCode,
    leagueName: league.leagueName || league.leagueCode,
    changed: true,
  };
}

async function unfollowLeague(args) {
  const inspected = await inspectLeagueUnfollow(args);
  if (inspected.status !== STATUS.OK) {
    return inspected;
  }

  await removeUserLeague(args.chatId, inspected.leagueCode);

  return {
    ...inspected,
    summary: t('Unfollowed league {CODE}.', args.chatId, {
      CODE: inspected.leagueCode,
    }),
  };
}

module.exports = { inspectLeagueUnfollow, unfollowLeague, STATUS };
