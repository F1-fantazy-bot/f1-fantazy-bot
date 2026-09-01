const QuickChart = require('quickchart-js');
const { t } = require('../i18n');
const { sendErrorMessage } = require('../utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getSelectedTeam } = require('../cache');
const {
  TEAM_COLOR_PALETTE,
  buildGapToLeaderSeries,
  buildRoundToRaceNameMap,
  getSortedMatchdayKeys,
  matchdayNumber,
} = require('../cores/leagueGraphsCore');
const {
  LEAGUE_GRAPH_CALLBACK_TYPE,
  LEAGUE_GRAPH_TYPE_CALLBACK_TYPE,
  LEAGUE_GRAPH_TYPES,
  COMMAND_FOLLOW_LEAGUE,
} = require('../constants');

/**
 * Build the Chart.js config consumed by QuickChart.
 * Pure function — no IO. All async work is done by the caller.
 *
 * Y-axis encodes each team's **gap to the leader** at every race
 * (cumulative_team - cumulative_leader). The leader sits on 0 at every
 * step; everyone else is at or below 0.
 *
 * @param {Object} leagueData - parsed `league-standings.json`.
 * @param {Object} [options]
 * @param {Record<number,string>} [options.roundToRaceName] - map of round -> short race name (e.g. "Chinese GP").
 * @returns {Object} Chart.js config.
 */
function buildChartConfig(leagueData, options = {}) {
  const graph = buildGapToLeaderSeries(leagueData, options);
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
        // `formatter` pulls from the dataset's own `chipLabels` array so each
        // dataset has its own per-point text without needing a global lookup.
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
  const title = `${graph.leagueName} — gap to leader per race`;

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
        legend: { position: 'bottom', labels: { boxWidth: 18, font: { size: 14 } } },
        datalabels: {
          // Dataset-level `datalabels` above provide the actual formatter;
          // this block just enables the plugin globally with sane defaults.
          display: true,
          font: { size: 12 },
        },
      },
      scales: {
        y: {
          // Leader is 0; gaps are negative — let Chart.js auto-fit the bottom.
          title: { display: true, text: 'Gap to leader (points)', font: { size: 15 } },
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
 * Render the league graph and send it to the user.
 * @param {Object} bot
 * @param {number|string} chatId
 * @param {string} leagueCode
 */
async function sendLeagueGraph(bot, chatId, leagueCode) {
  let leagueData;
  try {
    leagueData = await getLeagueData(leagueCode);
  } catch (err) {
    console.error('Error fetching league data for graph:', err);
    await sendErrorMessage(
      bot,
      `Failed to fetch league data for graph (${leagueCode}): ${err.message}`,
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

  // Best-effort: fetch the current season schedule so X-axis labels can
  // show short race names (e.g. "Chinese GP"). Falls back silently to "R{N}".
  let roundToRaceName = {};
  try {
    const seasonData = await fetchCurrentSeasonRaces();
    roundToRaceName = buildRoundToRaceNameMap(seasonData);
  } catch (err) {
    console.error('Error fetching season schedule for graph labels:', err);
  }

  const selectedTeamId = getSelectedTeam(chatId);
  const config = buildChartConfig(leagueData, {
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
    // Use the short-URL endpoint to avoid hitting the ~3 kB URL length limit
    // that the inline base64 variant has.
    url = await chart.getShortUrl();
  } catch (err) {
    console.error('Error generating chart URL:', err);
    await sendErrorMessage(
      bot,
      `Failed to generate league graph URL (${leagueCode}): ${err.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to generate the league graph: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  const caption = t('🏆 {LEAGUE} — gap to leader per race', chatId, {
    LEAGUE: leagueData.leagueName || leagueData.leagueCode || '',
  });

  try {
    await bot.sendPhoto(chatId, url, { caption });
  } catch (err) {
    console.error('Error sending league graph photo:', err);
    await sendErrorMessage(
      bot,
      `Failed to send league graph photo (${leagueCode}): ${err.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to send the league graph: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );
  }
}

/**
 * Color palette shared by every per-team line chart in this codebase. Exported
 * so sibling handlers (e.g. the budget graph) can stay visually consistent.
 */
const TEAM_COLOR_PALETTE_EXPORT = TEAM_COLOR_PALETTE;

/**
 * Build the inline keyboard that lets the user choose between the different
 * league-graph types (gap to leader vs. budget) for a specific league.
 * @param {string} leagueCode
 * @param {number|string} chatId
 * @returns {Array<Array<{text:string,callback_data:string}>>}
 */
function buildGraphTypeKeyboard(leagueCode, chatId) {
  return [
    [
      {
        text: t('📉 Gap to Leader', chatId),
        callback_data: `${LEAGUE_GRAPH_TYPE_CALLBACK_TYPE}:${LEAGUE_GRAPH_TYPES.GAP}:${leagueCode}`,
      },
    ],
    [
      {
        text: t('🏆 Standings', chatId),
        callback_data: `${LEAGUE_GRAPH_TYPE_CALLBACK_TYPE}:${LEAGUE_GRAPH_TYPES.STANDINGS}:${leagueCode}`,
      },
    ],
    [
      {
        text: t('💰 Budget', chatId),
        callback_data: `${LEAGUE_GRAPH_TYPE_CALLBACK_TYPE}:${LEAGUE_GRAPH_TYPES.BUDGET}:${leagueCode}`,
      },
    ],
  ];
}

/**
 * Prompt the user to pick a graph type for the given league.
 * @param {Object} bot
 * @param {number|string} chatId
 * @param {string} leagueCode
 * @param {Object} [options]
 * @param {number} [options.replyToMessageId]
 */
async function sendGraphTypePicker(bot, chatId, leagueCode, options = {}) {
  const reply_markup = { inline_keyboard: buildGraphTypeKeyboard(leagueCode, chatId) };
  const sendOptions = { reply_markup };
  if (options.replyToMessageId) {
    sendOptions.reply_to_message_id = options.replyToMessageId;
  }

  await bot.sendMessage(
    chatId,
    t('Which graph do you want to see?', chatId),
    sendOptions,
  );
}

async function handleLeagueGraphsCommand(bot, msg) {
  const chatId = msg.chat.id;

  let leagues;
  try {
    leagues = await listUserLeagues(chatId);
  } catch (err) {
    console.error('Error listing user leagues:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load your leagues: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!leagues || leagues.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'You are not following any league. Run {CMD} to follow one first.',
        chatId,
        { CMD: COMMAND_FOLLOW_LEAGUE },
      ),
    );

    return;
  }

  if (leagues.length === 1) {
    await sendGraphTypePicker(bot, chatId, leagues[0].leagueCode, {
      replyToMessageId: msg.message_id,
    });

    return;
  }

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: `${LEAGUE_GRAPH_CALLBACK_TYPE}:${league.leagueCode}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league graph do you want to see?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

module.exports = {
  handleLeagueGraphsCommand,
  sendLeagueGraph,
  sendGraphTypePicker,
  buildGraphTypeKeyboard,
  buildChartConfig,
  // Exported for unit tests and for reuse by sibling graph handlers.
  getSortedMatchdayKeys,
  buildRoundToRaceNameMap,
  matchdayNumber,
  TEAM_COLOR_PALETTE: TEAM_COLOR_PALETTE_EXPORT,
};
