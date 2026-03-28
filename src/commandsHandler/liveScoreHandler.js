const { getLiveScoreData } = require('../azureStorageService');
const { getSelectedBestTeam, resolveSelectedTeam } = require('../cache');
const { t } = require('../i18n');
const { formatDateTime, isAdminMessage, sendErrorMessage } = require('../utils');

const SESSION_METRICS = ['POS', 'PG', 'OV', 'FL', 'DD', 'TW', 'FP'];
const SESSION_ORDER = ['Sprint', 'Qualifying', 'Race'];

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
  { code, points, priceChange, details, isDrsBoost, isExtraDrsBoost },
  chatId,
) {
  const effectivePoints = isExtraDrsBoost ? points * 3 : isDrsBoost ? points * 2 : points;
  const drsLabel = isExtraDrsBoost
    ? ` (${t('Extra DRS', chatId)} x3)`
    : isDrsBoost
      ? ` (${t('DRS x2', chatId)})`
      : '';
  const sessionLines = SESSION_ORDER.map((sessionName) =>
    formatSessionBreakdown(sessionName, details[sessionName], chatId),
  ).filter(Boolean);

  return [
    `<b>${code}${drsLabel} — ${effectivePoints} ${t('pts', chatId)} | Δ ${formatSignedDelta(
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

function calculateLiveScoreBreakdown(selectedBestTeam, liveScoreData) {
  const driversData = liveScoreData.drivers || {};
  const constructorsData = liveScoreData.constructors || {};
  const drsDriver = selectedBestTeam.drsDriver || selectedBestTeam.drsBoost;
  const extraDrsDriver = selectedBestTeam.extraDrsDriver;

  const driverBreakdown = selectedBestTeam.drivers.map((driverCode) => {
    const member = getLiveMemberData(driversData, driverCode);

    return {
      code: driverCode,
      ...member,
      isDrsBoost: drsDriver === driverCode,
      isExtraDrsBoost: extraDrsDriver === driverCode,
    };
  });

  const constructorBreakdown = selectedBestTeam.constructors.map((constructorCode) => ({
    code: constructorCode,
    ...getLiveMemberData(constructorsData, constructorCode),
    isDrsBoost: false,
    isExtraDrsBoost: false,
  }));

  const totalPoints =
    driverBreakdown.reduce(
      (sum, driver) =>
        sum +
        driver.points +
        (driver.isExtraDrsBoost
          ? driver.points * 2
          : driver.isDrsBoost
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

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(chatId, t('Sorry, only admins can use this command.', chatId));

    return;
  }

  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const selectedBestTeam = getSelectedBestTeam(chatId, teamId);
  if (!selectedBestTeam) {
    await bot.sendMessage(
      chatId,
      t(
        'No selected best team found for {TEAM}. Please run /best_teams and send a number first.',
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
    } = calculateLiveScoreBreakdown(selectedBestTeam, liveScoreData);

    const extractedAt = new Date(liveScoreData.extractedAt);
    let formattedUpdate = String(liveScoreData.extractedAt || '-');
    if (!Number.isNaN(extractedAt.getTime())) {
      const { dateStr, timeStr } = formatDateTime(extractedAt, chatId);
      formattedUpdate = `${dateStr}, ${timeStr}`;
    }

    const messageParts = [
      `<b>🏎️ ${t('Live Score Summary', chatId)} (${teamId})</b>`,
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
};
