const QuickChart = require('quickchart-js');
const { t } = require('../i18n');
const { sendErrorMessage } = require('../utils');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getSelectedTeam } = require('../cache');
const {
  buildStandingsSeries,
  buildRoundToRaceNameMap,
  computeRankPerMatchday,
  getSortedMatchdayKeys,
} = require('../cores/leagueGraphsCore');

/**
 * Build the Chart.js config for the "standings per race" chart. Pure function
 * — no IO. Y-axis is reversed so rank 1 sits at the top.
 *
 * @param {Object} leagueData - parsed `league-standings.json`.
 * @param {Object} [options]
 * @param {Record<number,string>} [options.roundToRaceName]
 * @param {string|null} [options.selectedTeamId]
 * @returns {Object} Chart.js config.
 */
function buildStandingsChartConfig(leagueData, options = {}) {
  const graph = buildStandingsSeries(leagueData, options);
  const datasets = graph.series.map((series) => {
    const chipLabels = series.points.map((point) => point.chip?.label || '');
    const pointRadius = series.points.map((point) => (point.chip ? 9 : 4));
    const pointBorderWidth = series.points.map((point) =>
      point.chip ? 2 : 1,
    );

    return {
      label: series.teamName,
      data: series.points.map((point) => point.value),
      borderColor: series.color,
      backgroundColor: series.color,
      borderWidth: series.isSelected ? 6 : 3,
      fill: false,
      tension: 0.25,
      pointRadius: pointRadius.map((radius) =>
        series.isSelected ? radius + 3 : radius,
      ),
      pointHoverRadius: pointRadius.map((radius) =>
        series.isSelected ? radius + 3 : radius,
      ),
      pointBorderWidth,
      chipLabels,
      datalabels: {
        formatter: function (_value, ctx) {
          const labels = (ctx && ctx.dataset && ctx.dataset.chipLabels) || [];

          return labels[ctx.dataIndex] || '';
        },
        color: series.color,
        anchor: 'end',
        align: 'top',
        offset: 4,
        clamp: true,
        font: { size: 12, weight: 'bold' },
      },
    };
  });
  const title = `${graph.leagueName} — standings per race`;

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
        datalabels: { display: true, font: { size: 12 } },
      },
      scales: {
        y: {
          reverse: true,
          min: 1,
          max: graph.maxRank,
          title: {
            display: true,
            text: 'Standing',
            font: { size: 15 },
          },
          ticks: {
            stepSize: 1,
            precision: 0,
            font: { size: 13 },
          },
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
 * Render the league standings graph and send it to the user.
 * @param {Object} bot
 * @param {number|string} chatId
 * @param {string} leagueCode
 */
async function sendLeagueStandingsGraph(bot, chatId, leagueCode) {
  let leagueData;
  try {
    leagueData = await getLeagueData(leagueCode);
  } catch (err) {
    console.error('Error fetching league data for standings graph:', err);
    await sendErrorMessage(
      bot,
      `Failed to fetch league data for standings graph (${leagueCode}): ${err.message}`,
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
  if (teams.length === 0 || getSortedMatchdayKeys(teams).length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'Not enough race data yet to render a graph for this league.',
        chatId,
      ),
    );

    return;
  }

  let roundToRaceName = {};
  try {
    const seasonData = await fetchCurrentSeasonRaces();
    roundToRaceName = buildRoundToRaceNameMap(seasonData);
  } catch (err) {
    console.error(
      'Error fetching season schedule for standings graph labels:',
      err,
    );
  }

  const selectedTeamId = getSelectedTeam(chatId);
  const config = buildStandingsChartConfig(leagueData, {
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
    console.error('Error generating standings chart URL:', err);
    await sendErrorMessage(
      bot,
      `Failed to generate league standings graph URL (${leagueCode}): ${err.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to generate the league graph: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  const caption = t('🏆 {LEAGUE} — standings per race', chatId, {
    LEAGUE: leagueData.leagueName || leagueData.leagueCode || '',
  });

  try {
    await bot.sendPhoto(chatId, url, { caption });
  } catch (err) {
    console.error('Error sending league standings graph photo:', err);
    await sendErrorMessage(
      bot,
      `Failed to send league standings graph photo (${leagueCode}): ${err.message}`,
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
  sendLeagueStandingsGraph,
  buildStandingsChartConfig,
  computeRankPerMatchday,
};
