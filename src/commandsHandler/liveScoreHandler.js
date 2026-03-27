const { getLiveScoreData } = require('../azureStorageService');
const { currentTeamCache, resolveSelectedTeam } = require('../cache');
const { t } = require('../i18n');
const { formatDateTime, isAdminMessage, sendErrorMessage } = require('../utils');

const SESSION_NAMES = ['Sprint', 'Qualifying', 'Race'];
const SESSION_METRICS = ['POS', 'PG', 'OV', 'FL', 'DD', 'TW', 'FP'];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatSignedDelta(value, decimals = 2) {
  const numeric = Number(value) || 0;

  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(decimals)}`;
}

function formatSessionLine(sessionName, sessionData = {}) {
  const nonZeroMetrics = SESSION_METRICS.reduce((acc, metric) => {
    const value = Number(sessionData?.[metric]);
    if (Number.isFinite(value) && value !== 0) {
      acc.push(`${metric} ${value}`);
    }

    return acc;
  }, []);

  if (nonZeroMetrics.length === 0) {
    return '';
  }

  return `${sessionName}: ${nonZeroMetrics.join(', ')}`;
}

function formatMemberBlock(
  { code, points, priceChange, details, isDrsBoost },
) {
  const displayCode = escapeHtml(code);
  const scorePart = isDrsBoost
    ? `${points * 2} pts (${points} base + ${points} DRS)`
    : `${points}`;
  const drsLabel = isDrsBoost ? ' (DRS x2)' : '';
  const header = `<b>${displayCode}${drsLabel} — ${scorePart} | Δ ${formatSignedDelta(priceChange)}</b>`;

  const sessionLines = SESSION_NAMES.map((sessionName) =>
    formatSessionLine(sessionName, details?.[sessionName]),
  ).filter(Boolean);

  return [header, ...sessionLines].join('\n');
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

function calculateLiveScoreBreakdown(currentTeam, liveScoreData) {
  const driversData = liveScoreData.drivers || {};
  const constructorsData = liveScoreData.constructors || {};

  const driverBreakdown = currentTeam.drivers.map((driverCode) => {
    const member = getLiveMemberData(driversData, driverCode);

    return {
      code: driverCode,
      ...member,
      isDrsBoost: currentTeam.drsBoost === driverCode,
    };
  });

  const constructorBreakdown = currentTeam.constructors.map((constructorCode) => ({
    code: constructorCode,
    ...getLiveMemberData(constructorsData, constructorCode),
    isDrsBoost: false,
  }));

  const totalPoints =
    driverBreakdown.reduce(
      (sum, driver) => sum + driver.points + (driver.isDrsBoost ? driver.points : 0),
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

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, t('Sorry, only admins can use this command.', chatId));

    return;
  }

  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const currentTeam = currentTeamCache[chatId]?.[teamId];
  if (!currentTeam) {
    await bot.sendMessage(
      chatId,
      t(
        'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
        chatId,
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
    } = calculateLiveScoreBreakdown(currentTeam, liveScoreData);

    const extractedAt = new Date(liveScoreData.extractedAt);
    let formattedUpdate = String(liveScoreData.extractedAt || '-');
    if (!Number.isNaN(extractedAt.getTime())) {
      const { dateStr, timeStr } = formatDateTime(extractedAt, chatId);
      formattedUpdate = `${dateStr}, ${timeStr}`;
    }

    const driverBlocks = driverBreakdown.map((driver) => formatMemberBlock(driver));
    const constructorBlocks = constructorBreakdown.map((constructor) =>
      formatMemberBlock(constructor),
    );
    const missingLine =
      missingMembers.length > 0
        ? `⚠️ ${t('Missing live data for: {MEMBERS}', chatId, {
          MEMBERS: missingMembers.join(', '),
        })}`
        : '';

    const message = [
      `<b>🏎️ LIVE SCORE SUMMARY (${escapeHtml(teamId)})</b>`,
      `Updated At: ${formattedUpdate}`,
      `Total Live Points: ${totalPoints.toFixed(2)}`,
      `Total Live Price Change: ${formatSignedDelta(totalPriceChange)}`,
      '',
      `<b>👤 DRIVERS</b>`,
      driverBlocks.join('\n\n'),
      '',
      '',
      `<b>🛠️ CONSTRUCTORS</b>`,
      constructorBlocks.join('\n\n'),
      missingLine ? `\n${missingLine}` : '',
    ].join('\n');

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
  formatMemberBlock,
  formatSessionLine,
  formatSignedDelta,
};
