const {
  getLiveScoreData,
  getLockedTeamsData,
  listLockedMatchdays,
} = require('../azureStorageService');
const { currentTeamCache, resolveSelectedTeam } = require('../cache');
const {
  extractLeagueCode,
  mapNameToCode,
} = require('../utils/leagueTeamHelpers');
const { sanitizeTeamName } = require('../utils/teamId');
const { t } = require('../i18n');
const { formatDateTime, sendErrorMessage } = require('../utils');

const SESSION_METRICS = ['POS', 'PG', 'OV', 'FL', 'DD', 'TW', 'FP'];
const SESSION_ORDER = ['Sprint', 'Qualifying', 'Race'];

/**
 * Resolve the user's real team for live scoring.
 *
 * Priority:
 *   1. League team → fetch the latest `leagues/{code}/locked/matchday_{N}.json`
 *      snapshot and read the **locked** roster (Limitless mega-squad +
 *      `isCaptain` / `isMegaCaptain` flags preserved). Source = 'locked'.
 *   2. Otherwise (screenshot team or league team without a locked snapshot
 *      yet) → use `currentTeamCache[chatId][teamId]`. Source = 'cache'.
 *
 * Returns `null` when no source has the team (e.g. user uploaded nothing
 * and no locked snapshot exists yet).
 *
 * @param {string|number} chatId
 * @param {string} teamId
 * @returns {Promise<{drivers: string[], constructors: string[],
 *   boostDriver: string|null, extraBoostDriver: string|null,
 *   source: 'locked'|'cache', matchdayId: number|null}|null>}
 */
async function _lookupLockedTeam(leagueCode, sanitizedSlug) {
  const matchdayIds = await listLockedMatchdays(leagueCode);
  if (matchdayIds.length === 0) {
    return null;
  }

  const latestMd = matchdayIds[matchdayIds.length - 1];
  const snapshot = await getLockedTeamsData(leagueCode, latestMd);
  if (!snapshot || !Array.isArray(snapshot.teams)) {
    return null;
  }

  const match = snapshot.teams.find(
    (team) => sanitizeTeamName(team.teamName) === sanitizedSlug,
  );
  if (!match) {
    return null;
  }

  const driverEntries = Array.isArray(match.drivers) ? match.drivers : [];
  const constructorEntries = Array.isArray(match.constructors)
    ? match.constructors
    : [];
  const captain = driverEntries.find((d) => d?.isCaptain);
  const megaCaptain = driverEntries.find((d) => d?.isMegaCaptain);

  return {
    drivers: driverEntries.map((d) => mapNameToCode(d.name)),
    constructors: constructorEntries.map((c) => mapNameToCode(c.name)),
    boostDriver: captain ? mapNameToCode(captain.name) : null,
    extraBoostDriver: megaCaptain ? mapNameToCode(megaCaptain.name) : null,
    source: 'locked',
    matchdayId: snapshot.matchdayId ?? latestMd,
  };
}

async function resolveLiveScoreTeam(chatId, teamId) {
  const leagueCode = extractLeagueCode(teamId);
  if (leagueCode) {
    const sanitizedSlug = teamId.slice(leagueCode.length + 1);
    try {
      const locked = await _lookupLockedTeam(leagueCode, sanitizedSlug);
      if (locked) {
        return locked;
      }
    } catch (err) {
      // Best-effort: fall through to currentTeamCache when the locked
      // snapshot path fails (missing blob, network, etc.). The caller
      // surfaces a user-facing error only if BOTH paths fail.
      console.error(
        `Locked-snapshot lookup failed for ${leagueCode}/${teamId}:`,
        err,
      );
    }
  }

  const cached = currentTeamCache[chatId]?.[teamId];
  if (cached) {
    return {
      drivers: Array.isArray(cached.drivers) ? cached.drivers : [],
      constructors: Array.isArray(cached.constructors) ? cached.constructors : [],
      boostDriver: cached.boost ?? null,
      extraBoostDriver: null,
      source: 'cache',
      matchdayId: null,
    };
  }

  return null;
}

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

function getLiveMemberData(bucket = {}, code) {
  const memberData = bucket[code];

  if (!memberData) {
    return {
      points: 0,
      priceChange: 0,
      details: {},
      missing: true,
    };
  }

  return {
    points: Number(memberData.TotalPoints) || 0,
    priceChange: Number(memberData.PriceChange) || 0,
    details: memberData,
    missing: false,
  };
}

function calculateLiveScoreBreakdown(realTeam, liveScoreData) {
  const driversData = liveScoreData.drivers || {};
  const constructorsData = liveScoreData.constructors || {};
  const boostDriver = realTeam.boostDriver;
  const extraBoostDriver = realTeam.extraBoostDriver;

  const driverBreakdown = realTeam.drivers.map((driverCode) => {
    const member = getLiveMemberData(driversData, driverCode);

    return {
      code: driverCode,
      ...member,
      isBoost: boostDriver === driverCode,
      isExtraBoost: extraBoostDriver === driverCode,
    };
  });

  const constructorBreakdown = realTeam.constructors.map((constructorCode) => ({
    code: constructorCode,
    ...getLiveMemberData(constructorsData, constructorCode),
    isBoost: false,
    isExtraBoost: false,
  }));

  const totalPoints =
    driverBreakdown.reduce(
      (sum, driver) =>
        sum +
        driver.points +
        (driver.isExtraBoost
          ? driver.points * 2
          : driver.isBoost
            ? driver.points
            : 0),
      0,
    ) + constructorBreakdown.reduce((sum, constructor) => sum + constructor.points, 0);

  const totalPriceChange =
    driverBreakdown.reduce((sum, driver) => sum + driver.priceChange, 0) +
    constructorBreakdown.reduce((sum, constructor) => sum + constructor.priceChange, 0);

  const missingMembers = [...driverBreakdown, ...constructorBreakdown]
    .filter((member) => member.missing)
    .map((member) => member.code);

  return {
    totalPoints,
    totalPriceChange,
    driverBreakdown,
    constructorBreakdown,
    missingMembers,
  };
}

async function handleLiveScoreCommand(bot, msg) {
  const chatId = msg.chat.id;

  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const realTeam = await resolveLiveScoreTeam(chatId, teamId);
  if (!realTeam) {
    await bot.sendMessage(
      chatId,
      t(
        'No locked roster is available yet for {TEAM}. Either upload a current-team screenshot or wait for the next race weekend lock.',
        chatId,
        { TEAM: teamId },
      ),
    );

    return;
  }

  try {
    const liveScoreData = await getLiveScoreData();
    const {
      totalPoints,
      totalPriceChange,
      driverBreakdown,
      constructorBreakdown,
      missingMembers,
    } = calculateLiveScoreBreakdown(realTeam, liveScoreData);

    const extractedAt = new Date(liveScoreData.extractedAt);
    let formattedUpdate = String(liveScoreData.extractedAt || '-');
    if (!Number.isNaN(extractedAt.getTime())) {
      const { dateStr, timeStr } = formatDateTime(extractedAt, chatId);
      formattedUpdate = `${dateStr}, ${timeStr}`;
    }

    const sourceLabel =
      realTeam.source === 'locked'
        ? t('locked snapshot · md {MD}', chatId, { MD: realTeam.matchdayId })
        : t('current team', chatId);

    const messageParts = [
      `<b>🏎️ ${t('Live Score Summary', chatId)} (${teamId})</b>`,
      `<i>${t('Source', chatId)}: ${sourceLabel}</i>`,
      `<b>${t('Updated At', chatId)}:</b> ${formattedUpdate}`,
      `<b>${t('Total Live Points', chatId)}:</b> ${totalPoints.toFixed(2)}`,
      `<b>${t('Total Live Price Change', chatId)}:</b> ${totalPriceChange.toFixed(2)}`,
      '',
      `<b>👤 ${t('Live Drivers', chatId)}</b>`,
      joinMembersWithEmptyLine(driverBreakdown, chatId),
      '',
      '',
      `<b>🛠️ ${t('Live Constructors', chatId)}</b>`,
      joinMembersWithEmptyLine(constructorBreakdown, chatId),
    ];

    if (missingMembers.length > 0) {
      messageParts.push(
        '',
        `⚠️ ${t('Missing live data for: {MEMBERS}', chatId, {
          MEMBERS: missingMembers.join(', '),
        })}`,
      );
    }

    const message = messageParts.join('\n');

    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in handleLiveScoreCommand:', error);
    await sendErrorMessage(bot, `Error fetching live score: ${error.message}`);

    await bot.sendMessage(
      chatId,
      t('❌ Error fetching live score: {ERROR}', chatId, {
        ERROR: error.message,
      }),
    );
  }
}

module.exports = {
  handleLiveScoreCommand,
  calculateLiveScoreBreakdown,
  formatMemberLine,
  formatSessionBreakdown,
  resolveLiveScoreTeam,
};
