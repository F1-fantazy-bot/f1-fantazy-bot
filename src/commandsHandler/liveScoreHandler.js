const { getLiveScoreData } = require('../azureStorageService');
const { currentTeamCache, resolveSelectedTeam } = require('../cache');
const { t } = require('../i18n');
const { formatDateTime, isAdminMessage, sendErrorMessage } = require('../utils');

const SESSION_METRICS = ['POS', 'PG', 'OV', 'FL', 'DD', 'TW', 'FP'];
const SESSION_ORDER = ['Sprint', 'Qualifying', 'Race'];

function formatSignedDelta(value, decimals) {
  const numericValue = Number(value) || 0;
  const absoluteValue =
    typeof decimals === 'number'
      ? Math.abs(numericValue).toFixed(decimals)
      : String(Math.abs(numericValue));

  return `${numericValue >= 0 ? '+' : '-'}${absoluteValue}`;
}

function formatSessionBreakdown(sessionName, sessionData = {}) {
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

  return `${sessionName}: ${metrics.join(', ')}`;
}

function formatMemberLine(
  { code, points, priceChange, details, isDrsBoost },
  chatId,
) {
  const effectivePoints = isDrsBoost ? points * 2 : points;
  const drsLabel = isDrsBoost ? ` (${t('DRS x2', chatId)})` : '';
  const sessionLines = SESSION_ORDER.map((sessionName) =>
    formatSessionBreakdown(sessionName, details[sessionName]),
  ).filter(Boolean);

  return [
    `*${code}${drsLabel} — ${effectivePoints} pts | Δ ${formatSignedDelta(
      priceChange,
    )}*`,
    ...sessionLines,
  ].join('\n');
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

    const message = [
      `### 🏎️ Live Score Summary (${teamId})`,
      `*${t('Updated', chatId)}:* ${formattedUpdate}`,
      `*${t('Total Live Points', chatId)}:* ${totalPoints.toFixed(2)}`,
      `*${t('Total Price Change', chatId)}:* ${formatSignedDelta(
        totalPriceChange,
        2,
      )}`,
      '',
      '### 👤 Drivers',
      ...driverBreakdown
        .map((driver) => formatMemberLine(driver, chatId))
        .join('\n\n')
        .split('\n'),
      '',
      '### 🛠️ Constructors',
      ...constructorBreakdown
        .map((constructor) => formatMemberLine(constructor, chatId))
        .join('\n\n')
        .split('\n'),
      missingMembers.length > 0
        ? `\n⚠️ ${t('Missing live data for: {MEMBERS}', chatId, {
          MEMBERS: missingMembers.join(', '),
        })}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
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
};
