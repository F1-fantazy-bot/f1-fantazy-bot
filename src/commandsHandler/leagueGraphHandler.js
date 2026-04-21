const QuickChart = require('quickchart-js');
const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { sendErrorMessage } = require('../utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getChipEmoji } = require('../utils/chipEmojis');
const { getFlagForCountry } = require('../utils/countryFlags');
const {
  LEAGUE_GRAPH_CALLBACK_TYPE,
  COMMAND_FOLLOW_LEAGUE,
} = require('../constants');

// Distinct, high-contrast palette. Cycled when a league has more teams than colors.
const TEAM_COLOR_PALETTE = [
  '#e6194B', // red
  '#3cb44b', // green
  '#4363d8', // blue
  '#f58231', // orange
  '#911eb4', // purple
  '#42d4f4', // cyan
  '#f032e6', // magenta
  '#9A6324', // brown
  '#808000', // olive
  '#469990', // teal
  '#000075', // navy
  '#a9a9a9', // grey
];

/**
 * Extract matchday keys from a teams array and sort them by trailing numeric id.
 * Accepts keys like `matchday_1`, `matchday_10` — sorts numerically, not lexically.
 * @param {Array<Object>} teams
 * @returns {string[]}
 */
function getSortedMatchdayKeys(teams) {
  const keys = new Set();
  for (const team of teams) {
    if (team && team.raceScores && typeof team.raceScores === 'object') {
      for (const key of Object.keys(team.raceScores)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort((a, b) => {
    const numA = Number(String(a).replace(/^matchday_/, ''));
    const numB = Number(String(b).replace(/^matchday_/, ''));

    return numA - numB;
  });
}

function matchdayNumber(key) {
  const num = Number(String(key).replace(/^matchday_/, ''));

  return Number.isFinite(num) ? num : null;
}

/**
 * Build a `roundNumber -> flagEmoji` map from the Ergast current-season payload.
 * Returns an empty map if the payload shape is unexpected.
 * @param {Object|null} seasonData
 * @returns {Record<number,string>}
 */
function buildRoundToFlagMap(seasonData) {
  const races = seasonData?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races)) {
    return {};
  }

  const map = {};
  for (const race of races) {
    const round = Number(race?.round);
    const country = race?.Circuit?.Location?.country;
    if (!Number.isFinite(round) || !country) {
      continue;
    }
    const flag = getFlagForCountry(country);
    if (flag) {
      map[round] = flag;
    }
  }

  return map;
}

/**
 * Build the Chart.js config consumed by QuickChart.
 * Pure function — no IO. All async work is done by the caller.
 *
 * @param {Object} leagueData - parsed `league-standings.json`.
 * @param {Object} [options]
 * @param {Record<number,string>} [options.roundToFlag] - map of round -> flag emoji.
 * @returns {Object} Chart.js config.
 */
function buildChartConfig(leagueData, options = {}) {
  const roundToFlag = options.roundToFlag || {};

  const teams = Array.isArray(leagueData?.teams) ? [...leagueData.teams] : [];
  teams.sort((a, b) => (a.position || 0) - (b.position || 0));

  const matchdayKeys = getSortedMatchdayKeys(teams);

  const labels = matchdayKeys.map((key) => {
    const round = matchdayNumber(key);
    const flag = round !== null ? roundToFlag[round] || '' : '';
    const roundLabel = round !== null ? `R${round}` : key;

    return flag ? `${flag} ${roundLabel}` : roundLabel;
  });

  const datasets = teams.map((team, idx) => {
    const color = TEAM_COLOR_PALETTE[idx % TEAM_COLOR_PALETTE.length];

    // Cumulative score per matchday, in matchday order.
    const data = [];
    let running = 0;
    for (const key of matchdayKeys) {
      const raw = Number(team?.raceScores?.[key]);
      const delta = Number.isFinite(raw) ? raw : 0;
      running += delta;
      data.push(running);
    }

    // Per-point chip labels + point radii.
    const chipLabels = matchdayKeys.map(() => '');
    const pointRadius = matchdayKeys.map(() => 3);
    const pointBorderWidth = matchdayKeys.map(() => 1);

    const chips = Array.isArray(team?.chipsUsed) ? team.chipsUsed : [];
    for (const chip of chips) {
      const gameDayId = Number(chip?.gameDayId);
      if (!Number.isFinite(gameDayId)) {
        continue;
      }
      const idxInSeries = matchdayKeys.findIndex(
        (key) => matchdayNumber(key) === gameDayId,
      );
      if (idxInSeries === -1) {
        continue;
      }
      const emoji = getChipEmoji(chip?.name);
      const chipName = typeof chip?.name === 'string' ? chip.name : '';
      chipLabels[idxInSeries] = chipName ? `${emoji} ${chipName}` : emoji;
      pointRadius[idxInSeries] = 7;
      pointBorderWidth[idxInSeries] = 2;
    }

    return {
      label: team.teamName || team.userName || `Team ${idx + 1}`,
      data,
      borderColor: color,
      backgroundColor: color,
      fill: false,
      tension: 0.25,
      pointRadius,
      pointHoverRadius: pointRadius,
      pointBorderWidth,
      chipLabels,
      datalabels: {
        // `formatter` pulls from the dataset's own `chipLabels` array so each
        // dataset has its own per-point text without needing a global lookup.
        formatter: function (_value, ctx) {
          const labels = (ctx && ctx.dataset && ctx.dataset.chipLabels) || [];

          return labels[ctx.dataIndex] || '';
        },
        color,
        anchor: 'end',
        align: 'top',
        offset: 4,
        clamp: true,
        font: { size: 10, weight: 'bold' },
      },
    };
  });

  const title = `${leagueData?.leagueName || leagueData?.leagueCode || 'League'} — cumulative score per race`;

  return {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: false,
      plugins: {
        title: { display: true, text: title, font: { size: 16 } },
        legend: { position: 'bottom', labels: { boxWidth: 14 } },
        datalabels: {
          // Dataset-level `datalabels` above provide the actual formatter;
          // this block just enables the plugin globally with sane defaults.
          display: true,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Cumulative points' },
        },
        x: {
          title: { display: true, text: 'Race' },
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
  // include country flag emojis. Safe to fall back silently if it fails.
  let roundToFlag = {};
  try {
    const seasonData = await fetchCurrentSeasonRaces();
    roundToFlag = buildRoundToFlagMap(seasonData);
  } catch (err) {
    console.error('Error fetching season schedule for graph flags:', err);
  }

  const config = buildChartConfig(leagueData, { roundToFlag });

  const chart = new QuickChart();
  chart
    .setConfig(config)
    .setWidth(900)
    .setHeight(500)
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

  const caption = t('🏆 {LEAGUE} — score progression per race', chatId, {
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

async function handleLeagueGraphCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

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
    await sendLeagueGraph(bot, chatId, leagues[0].leagueCode);

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
  handleLeagueGraphCommand,
  sendLeagueGraph,
  buildChartConfig,
  // Exported for unit tests — not part of the public handler API.
  getSortedMatchdayKeys,
  buildRoundToFlagMap,
};
