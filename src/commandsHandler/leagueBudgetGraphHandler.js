const QuickChart = require('quickchart-js');
const { t } = require('../i18n');
const { sendErrorMessage } = require('../utils');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getSelectedTeam } = require('../cache');
const {
  buildBudgetSeries,
  buildRoundToRaceNameMap,
  getSortedBudgetMatchdayKeys,
} = require('../cores/leagueGraphsCore');

/**
 * Build the Chart.js config for the "budget per race" chart consumed by
 * QuickChart. Pure function — no IO. Each series is one team's
 * start-of-race budget (`maxTeambal`) per matchday.
 *
 * @param {Object} leagueData - parsed `league-standings.json`.
 * @param {Object} [options]
 * @param {Record<number,string>} [options.roundToRaceName] - round -> short race name.
 * @param {string|null} [options.selectedTeamId] - highlighted team id.
 * @returns {Object} Chart.js config.
 */
function buildBudgetChartConfig(leagueData, options = {}) {
  const graph = buildBudgetSeries(leagueData, options);
  const datasets = graph.series.map((series) => {
    return {
      label: series.teamName,
      data: series.points.map((point) => point.value),
      borderColor: series.color,
      backgroundColor: series.color,
      borderWidth: series.isSelected ? 6 : 3,
      fill: false,
      tension: 0.25,
      spanGaps: true,
      pointRadius: series.isSelected ? 7 : 4,
      pointHoverRadius: series.isSelected ? 10 : 6,
      pointBorderWidth: 1,
      datalabels: { display: false },
    };
  });
  const title = `${graph.leagueName} — budget per race`;

  return {
    type: 'line',
    data: {
      labels: graph.matchdays.map((matchday) => matchday.label),
      datasets,
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: true, text: title, font: { size: 22 } },
        legend: {
          position: 'bottom',
          labels: { boxWidth: 18, font: { size: 14 } },
        },
        datalabels: { display: false },
      },
      scales: {
        y: {
          title: {
            display: true,
            text: 'Budget ($M)',
            font: { size: 15 },
          },
          ticks: { font: { size: 13 } },
        },
        x: {
          title: { display: true, text: 'Race', font: { size: 15 } },
          ticks: { font: { size: 13 } },
        },
      },
      layout: { padding: { top: 24, right: 24, bottom: 8, left: 8 } },
    },
  };
}

/**
 * Render the league budget graph and send it to the user.
 * @param {Object} bot
 * @param {number|string} chatId
 * @param {string} leagueCode
 */
async function sendLeagueBudgetGraph(bot, chatId, leagueCode) {
  let leagueData;
  try {
    leagueData = await getLeagueData(leagueCode);
  } catch (err) {
    console.error('Error fetching league data for budget graph:', err);
    await sendErrorMessage(
      bot,
      `Failed to fetch league data for budget graph (${leagueCode}): ${err.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!leagueData) {
    await bot.sendMessage(
      chatId,
      t(
        'No leaderboard data is available yet for this league. Please try again later.',
        chatId,
      ),
    );

    return;
  }

  const teams = Array.isArray(leagueData.teams) ? leagueData.teams : [];
  if (teams.length === 0 || getSortedBudgetMatchdayKeys(teams).length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'No budget data is available yet for this league. Please try again later.',
        chatId,
      ),
    );

    return;
  }

  // Best-effort season schedule so labels read e.g. "Chinese GP" instead of "R2".
  let roundToRaceName = {};
  try {
    const seasonData = await fetchCurrentSeasonRaces();
    roundToRaceName = buildRoundToRaceNameMap(seasonData);
  } catch (err) {
    console.error('Error fetching season schedule for budget graph labels:', err);
  }

  const selectedTeamId = getSelectedTeam(chatId);
  const config = buildBudgetChartConfig(leagueData, {
    roundToRaceName,
    selectedTeamId,
  });

  const chart = new QuickChart();
  chart
    .setConfig(config)
    .setWidth(1600)
    .setHeight(920)
    .setDevicePixelRatio(3)
    .setBackgroundColor('white')
    .setVersion('4');

  let url;
  try {
    url = await chart.getShortUrl();
  } catch (err) {
    console.error('Error generating budget chart URL:', err);
    await sendErrorMessage(
      bot,
      `Failed to generate league budget graph URL (${leagueCode}): ${err.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to generate the league graph: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  const caption = t('💰 {LEAGUE} — budget per race', chatId, {
    LEAGUE: leagueData.leagueName || leagueData.leagueCode || '',
  });

  try {
    await bot.sendPhoto(chatId, url, { caption });
  } catch (err) {
    console.error('Error sending league budget graph photo:', err);
    await sendErrorMessage(
      bot,
      `Failed to send league budget graph photo (${leagueCode}): ${err.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to send the league graph: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );
  }
}

module.exports = {
  sendLeagueBudgetGraph,
  buildBudgetChartConfig,
  getSortedBudgetMatchdayKeys,
};
