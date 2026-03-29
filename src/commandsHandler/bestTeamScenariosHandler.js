const { validateJsonData } = require('../utils');
const { calculateBestTeams } = require('../bestTeamsCalculator');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  resolveSelectedTeam,
  remainingRaceCountCache,
} = require('../cache');
const { t } = require('../i18n');
const {
  EXTRA_BOOST_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
} = require('../constants');

function formatNumber(value) {
  return Number(Number(value || 0).toFixed(2)).toFixed(2);
}

function getChipRecommendationDot(chip, diff) {
  if (!Number.isFinite(diff)) {
    return '';
  }

  if (chip === WILDCARD_CHIP) {
    if (diff >= 30) {
      return ' 🟢';
    }

    if (diff >= 20) {
      return ' 🟡';
    }

    return '';
  }

  if (chip === LIMITLESS_CHIP) {
    if (diff >= 120) {
      return ' 🟢';
    }

    if (diff >= 100) {
      return ' 🟡';
    }

    return '';
  }

  if (chip === EXTRA_BOOST_CHIP) {
    if (diff >= 70) {
      return ' 🟢';
    }

    if (diff >= 50) {
      return ' 🟡';
    }

    return '';
  }

  return '';
}

function getTopBestTeamForScenario(
  cachedJsonData,
  selectedChip,
  budgetChangePointsPerMillion,
  remainingRaceCount,
) {
  const [topTeam] = calculateBestTeams(
    cachedJsonData,
    selectedChip,
    budgetChangePointsPerMillion,
    remainingRaceCount,
  );

  return topTeam;
}

async function handleBestTeamScenariosMessage(bot, chatId) {
  const teamId = await resolveSelectedTeam(bot, chatId);
  if (!teamId) {
    return;
  }

  const drivers = driversCache[chatId] || driversCache[sharedKey];
  const constructors = constructorsCache[chatId] || constructorsCache[sharedKey];
  const currentTeam = currentTeamCache[chatId]?.[teamId];

  if (!drivers || !constructors || !currentTeam) {
    await bot
      .sendMessage(
        chatId,
        t(
          'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
          chatId,
        ),
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err),
      );

    return;
  }

  const cachedJsonData = {
    Drivers: drivers,
    Constructors: constructors,
    CurrentTeam: currentTeam,
  };

  if (
    !validateJsonData(
      bot,
      {
        Drivers: Object.values(drivers),
        Constructors: Object.values(constructors),
        CurrentTeam: currentTeam,
      },
      chatId,
    )
  ) {
    return;
  }

  const selectedChip = selectedChipCache[chatId]?.[teamId];
  const remainingRaceCount = remainingRaceCountCache[sharedKey];
  const safeRemainingRaceCount = Number.isFinite(remainingRaceCount)
    ? remainingRaceCount
    : 0;

  const ppmScenarios = [0, 1.3, 1.65, 2];
  const chipScenarios = [
    {
      label: t('Without Chip', chatId),
      chip: selectedChip,
    },
    {
      label: t('Limitless', chatId),
      chip: LIMITLESS_CHIP,
    },
    {
      label: t('Extra Boost', chatId),
      chip: EXTRA_BOOST_CHIP,
    },
    {
      label: t('Wildcard', chatId),
      chip: WILDCARD_CHIP,
    },
  ];

  const sections = ppmScenarios.map((ppm) => {
    const sectionTitle = `*${formatNumber(ppm)} ${t('points per million', chatId)}*`;
    const scenarioResults = chipScenarios.map((scenario) => {
      const topTeam = getTopBestTeamForScenario(
        cachedJsonData,
        scenario.chip,
        ppm,
        safeRemainingRaceCount,
      );

      return { scenario, topTeam };
    });

    const baselineScore = scenarioResults[0]?.topTeam?.projected_points;

    const lines = scenarioResults.map(({ scenario, topTeam }) => {
      if (!topTeam) {
        return `• *${scenario.label}* — ${t('Unavailable', chatId)}`;
      }

      const recommendationDot = getChipRecommendationDot(
        scenario.chip,
        topTeam.projected_points - baselineScore,
      );

      return (
        `• *${scenario.label}* — ` +
        `${formatNumber(topTeam.projected_points)} ${t('pts', chatId)} | ` +
        `Δ ${formatNumber(topTeam.expected_price_change)}` +
        recommendationDot
      );
    });

    return [sectionTitle, ...lines].join('\n');
  });

  const message = [`*${t('Best Team Scenarios', chatId)}*`, '', ...sections].join(
    '\n\n',
  );

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch((err) =>
    console.error('Error sending best team scenarios message:', err),
  );
}

module.exports = {
  handleBestTeamScenariosMessage,
  getTopBestTeamForScenario,
  getChipRecommendationDot,
};
