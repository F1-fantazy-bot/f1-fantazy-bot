const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { getSelectedTeam } = require('../../cache');
const { LEAGUE_GRAPH_TYPES } = require('../../constants');
const {
  buildLeagueGraphSeries,
  buildRoundToRaceNameMap,
} = require('../../cores/leagueGraphsCore');
const { getLeagueData } = require('../../azureStorageService');
const { listUserLeagues } = require('../../leagueRegistryService');
const { fetchCurrentSeasonRaces } = require('../../raceScheduleService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getFreshSelectedTeamPreference,
} = require('../../services/selectTeamService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');

const GRAPH_TYPES = [
  LEAGUE_GRAPH_TYPES.GAP,
  LEAGUE_GRAPH_TYPES.STANDINGS,
  LEAGUE_GRAPH_TYPES.BUDGET,
];

function publicLeague(league) {
  return {
    leagueCode: league.leagueCode,
    leagueName: league.leagueName || league.leagueCode,
  };
}

const getLeagueGraphTool = defineTool({
  name: 'get_league_graph',
  description:
    'Build a structured chart for one followed F1 Fantasy league. graphType="gap" shows cumulative gap to the leader, "standings" shows competition-ranked position per race, and "budget" shows budget per race. Omit leagueCode to return clickable followed-league cards. Omit graphType after choosing a league to return clickable graph-type cards. Returns selected-team highlighting, race labels, excluded-team filtering, chip markers, tied standings, and null budget gaps. Statuses: select_league, select_graph_type, no_followed_leagues, not_followed, not_found, no_data, or ok.',
  parameters: z.object({
    leagueCode: z
      .string()
      .optional()
      .describe(
        'Canonical code of a followed league. Omit it to render clickable followed-league cards.',
      ),
    graphType: z
      .enum(GRAPH_TYPES)
      .optional()
      .describe(
        'Graph to render: gap, standings, or budget. Omit it to render clickable graph-type cards.',
      ),
  }),
  execute: wrapToolExecute('get_league_graph', async (args) => {
    await ensureCacheReady();
    const chatId = getAgentChatId();
    const [{ lang }, userLeagues] = await Promise.all([
      getFreshLanguagePreference(chatId),
      listUserLeagues(chatId),
    ]);
    const leagues = (userLeagues || []).map(publicLeague);
    const graphType = args?.graphType || null;

    if (leagues.length === 0) {
      return { status: 'no_followed_leagues', lang, leagues: [] };
    }

    const leagueCode = args?.leagueCode?.trim();
    if (!leagueCode) {
      return { status: 'select_league', lang, graphType, leagues };
    }

    const followedLeague = leagues.find(
      (league) => league.leagueCode === leagueCode,
    );
    if (!followedLeague) {
      return { status: 'not_followed', lang, leagueCode, graphType };
    }

    if (!graphType) {
      return {
        status: 'select_graph_type',
        lang,
        leagueCode,
        leagueName: followedLeague.leagueName,
        graphTypes: GRAPH_TYPES,
      };
    }

    const leagueData = await getLeagueData(leagueCode);
    if (!leagueData) {
      return {
        status: 'not_found',
        lang,
        leagueCode,
        leagueName: followedLeague.leagueName,
        graphType,
      };
    }

    let roundToRaceName = {};
    try {
      roundToRaceName = buildRoundToRaceNameMap(
        await fetchCurrentSeasonRaces(),
      );
    } catch {
      // Race names are optional. The core falls back to R{matchdayId} labels.
    }

    await getFreshSelectedTeamPreference(chatId);
    const selectedTeamId = getSelectedTeam(chatId);
    const graph = buildLeagueGraphSeries(leagueData, {
      graphType,
      roundToRaceName,
      selectedTeamId,
    });

    if (graph.matchdays.length === 0 || graph.series.length === 0) {
      return {
        status: 'no_data',
        lang,
        leagueCode,
        leagueName: graph.leagueName || followedLeague.leagueName,
        graphType,
      };
    }

    return {
      status: 'ok',
      lang,
      selectedTeamId,
      ...graph,
    };
  }),
});

module.exports = { GRAPH_TYPES, getLeagueGraphTool, publicLeague };
