const { validateJsonData } = require('../utils');
const { calculateBestTeams } = require('../bestTeamsCalculator');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  resolveSelectedTeam,
  getBestTeamBudgetChangePointsPerMillion,
  remainingRaceCountCache,
} = require('../cache');
const { t } = require('../i18n');
const {
  EXTRA_DRS_CHIP,
  LIMITLESS_CHIP,
  WILDCARD_CHIP,
} = require('../constants');

function formatNumber(value) {
  return Number(Number(value || 0).toFixed(2)).toFixed(2);
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
  const selectedRankingValue = getBestTeamBudgetChangePointsPerMillion(chatId, teamId);
  const remainingRaceCount = remainingRaceCountCache[sharedKey];
  const safeRemainingRaceCount = Number.isFinite(remainingRaceCount)
    ? remainingRaceCount
    : 0;

  if (selectedRankingValue > 0 && !Number.isFinite(remainingRaceCount)) {
    await bot
      .sendMessage(
        chatId,
        t(
          'Remaining race count is unavailable right now. Switch to Pure Points or try again later.',
          chatId,
        ),
      )
      .catch((err) =>
        console.error('Error sending remaining race count unavailable message:', err),
      );

    return;
  }

  const rankingScenarios = [0, 1.3, 1.65, 2].map((ppm) => ({
    label: `${ppm.toFixed(2)} ppm`,
    ppm,
    chip: selectedChip,
  }));

  const chipScenarios = [
    { label: t('Extra DRS', chatId), chip: EXTRA_DRS_CHIP },
    { label: t('Limitless', chatId), chip: LIMITLESS_CHIP },
    { label: t('Wildcard', chatId), chip: WILDCARD_CHIP },
  ];

  const rankingLines = rankingScenarios
    .map((scenario) => {
      const topTeam = getTopBestTeamForScenario(
        cachedJsonData,
        scenario.chip,
        scenario.ppm,
        safeRemainingRaceCount,
      );

      if (!topTeam) {
        return `*${scenario.label}* — ${t('Unavailable', chatId)}`;
      }

      return (
        `*${scenario.label}* — ${formatNumber(topTeam.projected_points)} ${t('pts', chatId)} | ` +
        `Δ ${formatNumber(topTeam.expected_price_change)} | ` +
        `${t('Adj', chatId)} ${formatNumber(topTeam.budget_adjusted_points)}`
      );
    })
    .join('\n');

  const chipLines = chipScenarios
    .map((scenario) => {
      const topTeam = getTopBestTeamForScenario(
        cachedJsonData,
        scenario.chip,
        selectedRankingValue,
        safeRemainingRaceCount,
      );

      if (!topTeam) {
        return `*${scenario.label}* — ${t('Unavailable', chatId)}`;
      }

      return (
        `*${scenario.label}* — ${formatNumber(topTeam.projected_points)} ${t('pts', chatId)} | ` +
        `Δ ${formatNumber(topTeam.expected_price_change)}`
      );
    })
    .join('\n');

  const message = [
    `*${t('Best Team Scenarios', chatId)}*`,
    '',
    `*${t('Ranking Modes', chatId)}*`,
    rankingLines,
    '',
    `*${t('Chips', chatId)}*`,
    chipLines,
  ].join('\n');

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch((err) =>
    console.error('Error sending best team scenarios message:', err),
  );
}

module.exports = {
  handleBestTeamScenariosMessage,
  getTopBestTeamForScenario,
};
