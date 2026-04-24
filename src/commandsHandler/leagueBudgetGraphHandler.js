const QuickChart = require('quickchart-js');
const { t } = require('../i18n');
const { sendErrorMessage } = require('../utils');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getSelectedTeam } = require('../cache');
const { buildTeamId } = require('../utils/teamId');
const {
  buildRoundToRaceNameMap,
  matchdayNumber,
  TEAM_COLOR_PALETTE,
} = require('./leagueGraphHandler');

/**
 * Extract matchday keys from the teams' `raceBudgets` maps and sort them
 * numerically by trailing id (so `matchday_10` comes after `matchday_9`).
 * @param {Array<Object>} teams
 * @returns {string[]}
 */
function getSortedBudgetMatchdayKeys(teams) {
  const keys = new Set();
  for (const team of teams) {
    if (team && team.raceBudgets && typeof team.raceBudgets === 'object') {
      for (const key of Object.keys(team.raceBudgets)) {
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
  const roundToRaceName = options.roundToRaceName || {};
  const selectedTeamId = options.selectedTeamId || null;

  const teams = Array.isArray(leagueData?.teams) ? [...leagueData.teams] : [];
  const matchdayKeys = getSortedBudgetMatchdayKeys(teams);

  // Sort legend/series order by each team's most recent recorded budget
  // (highest first). Falls back to the latest-available matchday per team
  // if the most recent matchday has no entry. Teams with no budget data
  // sink to the bottom; ties break by `position` (leaderboard order).
  const latestBudgetByTeam = new Map();
  for (const team of teams) {
    let latest = null;
    for (let i = matchdayKeys.length - 1; i >= 0; i--) {
      const raw = Number(team?.raceBudgets?.[matchdayKeys[i]]);
      if (Number.isFinite(raw)) {
        latest = raw;
        break;
      }
    }
    latestBudgetByTeam.set(team, latest);
  }
  teams.sort((a, b) => {
    const aVal = latestBudgetByTeam.get(a);
    const bVal = latestBudgetByTeam.get(b);
    if (aVal === null && bVal === null) {
      return (a.position || 0) - (b.position || 0);
    }
    if (aVal === null) {
      return 1;
    }
    if (bVal === null) {
      return -1;
    }
    if (bVal !== aVal) {
      return bVal - aVal;
    }

    return (a.position || 0) - (b.position || 0);
  });

  const labels = matchdayKeys.map((key) => {
    const round = matchdayNumber(key);
    if (round !== null && roundToRaceName[round]) {
      return roundToRaceName[round];
    }

    return round !== null ? `R${round}` : key;
  });

  const datasets = teams.map((team, idx) => {
    const color = TEAM_COLOR_PALETTE[idx % TEAM_COLOR_PALETTE.length];
    const teamId = buildTeamId(
      leagueData?.leagueCode,
      team.teamName || team.userName || 'team',
    );
    const isSelectedTeam = teamId === selectedTeamId;

    const data = matchdayKeys.map((key) => {
      const raw = Number(team?.raceBudgets?.[key]);

      // Leave gaps as `null` so Chart.js breaks the line instead of dropping
      // to 0 — a team without a recorded budget for this race just has no
      // point at that x position.
      return Number.isFinite(raw) ? raw : null;
    });

    const teamLabel = team.teamName || team.userName || `Team ${idx + 1}`;

    return {
      label: teamLabel,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: isSelectedTeam ? 6 : 3,
      fill: false,
      tension: 0.25,
      spanGaps: true,
      pointRadius: isSelectedTeam ? 7 : 4,
      pointHoverRadius: isSelectedTeam ? 10 : 6,
      pointBorderWidth: 1,
      datalabels: { display: false },
    };
  });

  const title = `${leagueData?.leagueName || leagueData?.leagueCode || 'League'} — budget per race`;

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
