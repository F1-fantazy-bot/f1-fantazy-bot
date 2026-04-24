const QuickChart = require('quickchart-js');
const { t } = require('../i18n');
const { sendErrorMessage } = require('../utils');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getChipEmoji } = require('../utils/chipEmojis');
const { getSelectedTeam } = require('../cache');
const { buildTeamId } = require('../utils/teamId');
const {
  buildRoundToRaceNameMap,
  matchdayNumber,
  getSortedMatchdayKeys,
  TEAM_COLOR_PALETTE,
} = require('./leagueGraphHandler');

/**
 * Compute each team's rank per matchday from the cumulative `raceScores`.
 *
 * Ranks use **competition ranking** (ties share a rank, next rank is skipped
 * by the number of tied teams — e.g. 1, 2, 2, 4). Mirrors how the F1 Fantasy
 * leaderboard itself handles ties.
 *
 * Missing `raceScores` entries are treated as `0` so a team's cumulative
 * total always advances (or stays flat) between races.
 *
 * @param {Array<Object>} teams
 * @param {string[]} matchdayKeys - already sorted ascending.
 * @returns {number[][]} ranksPerTeam — `ranksPerTeam[teamIndex][mdIndex] = rank`.
 */
function computeRankPerMatchday(teams, matchdayKeys) {
  const cumulative = teams.map(() => 0);
  const ranksPerTeam = teams.map(() => []);

  for (let mdIdx = 0; mdIdx < matchdayKeys.length; mdIdx++) {
    const key = matchdayKeys[mdIdx];
    for (let tIdx = 0; tIdx < teams.length; tIdx++) {
      const raw = Number(teams[tIdx]?.raceScores?.[key]);
      cumulative[tIdx] += Number.isFinite(raw) ? raw : 0;
    }

    const indices = teams.map((_, i) => i);
    indices.sort((a, b) => cumulative[b] - cumulative[a]);

    // Competition ranking: equal cumulative totals share the same rank,
    // next team's rank skips by the tie count.
    let currentRank = 0;
    let lastScore = null;
    let seen = 0;
    for (const i of indices) {
      seen += 1;
      if (lastScore === null || cumulative[i] !== lastScore) {
        currentRank = seen;
        lastScore = cumulative[i];
      }
      ranksPerTeam[i][mdIdx] = currentRank;
    }
  }

  return ranksPerTeam;
}

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
  const roundToRaceName = options.roundToRaceName || {};
  const selectedTeamId = options.selectedTeamId || null;

  const teams = Array.isArray(leagueData?.teams) ? [...leagueData.teams] : [];
  const matchdayKeys = getSortedMatchdayKeys(teams);

  const ranksPerTeam = computeRankPerMatchday(teams, matchdayKeys);

  // Sort legend/series by the **current-race rank** (ascending — rank 1 first).
  // Teams with no races yet (empty rank series) sink to the bottom, tie-break
  // by `position`.
  const lastRankByTeam = new Map();
  teams.forEach((team, idx) => {
    const ranks = ranksPerTeam[idx];
    const last = ranks.length > 0 ? ranks[ranks.length - 1] : null;
    lastRankByTeam.set(team, last);
  });
  const indexed = teams.map((team, idx) => ({ team, idx }));
  indexed.sort((a, b) => {
    const aRank = lastRankByTeam.get(a.team);
    const bRank = lastRankByTeam.get(b.team);
    if (aRank === null && bRank === null) {
      return (a.team.position || 0) - (b.team.position || 0);
    }
    if (aRank === null) {
      return 1;
    }
    if (bRank === null) {
      return -1;
    }
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return (a.team.position || 0) - (b.team.position || 0);
  });

  const labels = matchdayKeys.map((key) => {
    const round = matchdayNumber(key);
    if (round !== null && roundToRaceName[round]) {
      return roundToRaceName[round];
    }

    return round !== null ? `R${round}` : key;
  });

  const datasets = indexed.map(({ team, idx: origIdx }, legendIdx) => {
    const color = TEAM_COLOR_PALETTE[legendIdx % TEAM_COLOR_PALETTE.length];
    const teamId = buildTeamId(
      leagueData?.leagueCode,
      team.teamName || team.userName || 'team',
    );
    const isSelectedTeam = teamId === selectedTeamId;

    const data = ranksPerTeam[origIdx].slice();

    // Per-point chip labels + point radii (same pattern as the gap graph).
    const chipLabels = matchdayKeys.map(() => '');
    const pointRadius = matchdayKeys.map(() => 4);
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
      pointRadius[idxInSeries] = 9;
      pointBorderWidth[idxInSeries] = 2;
    }

    const teamLabel = team.teamName || team.userName || `Team ${legendIdx + 1}`;

    return {
      label: teamLabel,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: isSelectedTeam ? 6 : 3,
      fill: false,
      tension: 0.25,
      pointRadius: pointRadius.map((radius) =>
        isSelectedTeam ? radius + 3 : radius,
      ),
      pointHoverRadius: pointRadius.map((radius) =>
        isSelectedTeam ? radius + 3 : radius,
      ),
      pointBorderWidth,
      chipLabels,
      datalabels: {
        formatter: function (_value, ctx) {
          const labels = (ctx && ctx.dataset && ctx.dataset.chipLabels) || [];

          return labels[ctx.dataIndex] || '';
        },
        color,
        anchor: 'end',
        align: 'top',
        offset: 4,
        clamp: true,
        font: { size: 12, weight: 'bold' },
      },
    };
  });

  const title = `${leagueData?.leagueName || leagueData?.leagueCode || 'League'} — standings per race`;

  const maxRank = Math.max(1, teams.length);

  return {
    type: 'line',
    data: { labels, datasets },
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
          max: maxRank,
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
