const { getLiveScoreData } = require('../azureStorageService');
const { currentTeamCache, resolveSelectedTeam } = require('../cache');
const { t } = require('../i18n');
const { isAdminMessage, sendErrorMessage } = require('../utils');

const STAT_LABELS_HE = {
  POS: 'מיקום',
  PG: 'שיפור מיקום',
  OV: 'עקיפות',
  FL: 'הקפה מהירה',
  DD: 'נהג היום',
  TW: 'ניצחונות פנימיים',
  FP: 'עצירה מהירה',
};

const SESSION_LABELS_HE = {
  Sprint: 'ספרינט',
  Qualifying: 'דירוג',
  Race: 'מירוץ',
};

const DRIVER_NAMES_HE = {
  ANT: 'אנטונלי',
  LEC: 'לקלר',
  HAM: 'המילטון',
  RUS: 'ראסל',
  LAW: 'לאוסון',
  BEA: 'ברמן',
  SAI: 'סיינז',
  OCO: 'אוקון',
  GAS: 'גאסלי',
  PER: 'פרז',
  HAD: 'הדג׳אר',
  COL: 'קולאפינטו',
  VER: 'ורסטאפן',
  HUL: 'הולקנברג',
  LIN: 'לינדבלאד',
  BOT: 'בוטאס',
  ALO: 'אלונסו',
  PIA: 'פיאסטרי',
  ALB: 'אלבון',
  NOR: 'נוריס',
  STR: 'סטרול',
  BOR: 'בורטולטו',
};

const CONSTRUCTOR_NAMES_HE = {
  FER: 'פרארי',
  MER: 'מרצדס',
  HAA: 'האס',
  VRB: 'רייסינג בולס',
  ALP: 'אלפין',
  RED: 'רד בול',
  CAD: 'קדילאק',
  WIL: 'וויליאמס',
  AUD: 'אאודי',
  MCL: 'מקלארן',
  AST: 'אסטון מרטין',
};

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value).toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatSignedPrice(value) {
  const numeric = Number(value) || 0;
  const sign = numeric > 0 ? '+' : '';

  return `${sign}${formatNumber(numeric, 1)}`;
}

function getDisplayName(code, type, { isDrsBoost = false } = {}) {
  const sourceMap = type === 'driver' ? DRIVER_NAMES_HE : CONSTRUCTOR_NAMES_HE;
  const displayName = sourceMap[code] || code;

  if (type === 'driver' && isDrsBoost) {
    return `${displayName} (${code}) 👑 קפטן (DRS)`;
  }

  return `${displayName} (${code})`;
}

function formatSessionBreakdown(sessionStats = {}) {
  const positiveOrNeutralStats = [];
  const deductionStats = [];

  for (const [key, rawValue] of Object.entries(sessionStats)) {
    const value = Number(rawValue) || 0;
    if (value === 0) {
      continue;
    }

    const label = STAT_LABELS_HE[key] || key;
    const formattedStat = `${label} (${value})`;
    if (value < 0) {
      deductionStats.push(formattedStat);
    } else {
      positiveOrNeutralStats.push(formattedStat);
    }
  }

  const sections = [];
  if (positiveOrNeutralStats.length > 0) {
    sections.push(positiveOrNeutralStats.join(', '));
  }
  if (deductionStats.length > 0) {
    sections.push(`*הופחתו:* ${deductionStats.join(', ')}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join(' | ');
}

function formatMemberLine({ type, code, points, priceChange, details, isDrsBoost }) {
  const effectivePoints = isDrsBoost ? points * 2 : points;
  const sessions = Object.entries(SESSION_LABELS_HE)
    .map(([sessionKey, sessionLabel]) => {
      const formatted = formatSessionBreakdown(details[sessionKey] || {});
      if (!formatted) {
        return null;
      }

      return `    * **${sessionLabel}:** ${formatted}`;
    })
    .filter(Boolean);

  return [
    `* **${getDisplayName(code, type, { isDrsBoost })}** | ${formatNumber(effectivePoints)} נק' | 📈 ${formatSignedPrice(priceChange)}`,
    ...sessions,
  ].join('\n');
}

function formatUpdatedAt(rawTimestamp) {
  const extractedAt = new Date(rawTimestamp);
  if (Number.isNaN(extractedAt.getTime())) {
    return String(rawTimestamp || '-');
  }

  return extractedAt.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      type: 'driver',
      code: driverCode,
      ...member,
      isDrsBoost: currentTeam.drsBoost === driverCode,
    };
  });

  const constructorBreakdown = currentTeam.constructors.map((constructorCode) => ({
    type: 'constructor',
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

    const formattedUpdate = formatUpdatedAt(liveScoreData.extractedAt);

    const message = [
      `⏱️ *עודכן לאחרונה: ${formattedUpdate}*`,
      '',
      `📊 **סה״כ נקודות:** ${formatNumber(totalPoints)}`,
      `📈 **שינוי שווי הקבוצה:** ${formatSignedPrice(totalPriceChange)}M`,
      '',
      '🏎️ **פירוט נהגים**',
      ...driverBreakdown.map((driver) => formatMemberLine(driver)),
      '',
      '🛡️ **פירוט קבוצות**',
      ...constructorBreakdown.map((constructor) => formatMemberLine(constructor)),
      missingMembers.length > 0
        ? `\n⚠️ חסרים נתוני לייב עבור: ${missingMembers.join(', ')}`
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
};
