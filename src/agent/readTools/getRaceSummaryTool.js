const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const {
  buildRaceSummaryData,
  findRaceName,
} = require('../../cores/raceSummaryCore');
const {
  getLeagueData,
  getLockedTeamsData,
} = require('../../azureStorageService');
const { listUserLeagues } = require('../../leagueRegistryService');
const { fetchCurrentSeasonRaces } = require('../../raceScheduleService');
const { generateRaceSummary } = require('../../services/raceSummaryService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { sendErrorMessage, sendLogMessage } = require('../../utils/utils');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { getNotifierBot } = require('../notifierBot');
const { wrapToolExecute } = require('../wrapToolExecute');

function publicLeague(league) {
  return {
    leagueCode: league.leagueCode,
    leagueName: league.leagueName || league.leagueCode,
  };
}

const getRaceSummaryTool = defineTool({
  name: 'get_race_summary',
  description:
    'Generate a concise post-race recap for one followed F1 Fantasy league using the saved account language. Pass a canonical leagueCode only when the user provided or selected one. If leagueCode is omitted, returns followed leagues as clickable cards. The recap shares Telegram source facts, exclusion rules, roster fallback, prompt, and model. Statuses: select_league, no_followed_leagues, not_followed, missing_data, empty, generation_error, or ok.',
  parameters: z.object({
    leagueCode: z
      .string()
      .optional()
      .describe(
        'Canonical code of a followed league. Omit it to render clickable followed-league cards.',
      ),
  }),
  execute: wrapToolExecute('get_race_summary', async (args) => {
    await ensureCacheReady();
    const chatId = getAgentChatId();
    const [{ lang }, userLeagues] = await Promise.all([
      getFreshLanguagePreference(chatId),
      listUserLeagues(chatId),
    ]);
    const leagues = (userLeagues || []).map(publicLeague);

    if (leagues.length === 0) {
      return { status: 'no_followed_leagues', lang, leagues: [] };
    }

    const leagueCode = args?.leagueCode?.trim();
    if (!leagueCode) {
      return { status: 'select_league', lang, leagues };
    }

    const followedLeague = leagues.find(
      (league) => league.leagueCode === leagueCode,
    );
    if (!followedLeague) {
      return { status: 'not_followed', lang, leagueCode };
    }

    // Authorization above is deliberately completed before either league blob
    // is read. Unexpected storage failures belong to wrapToolExecute.
    const [leagueData, lockedTeamsData] = await Promise.all([
      getLeagueData(leagueCode),
      getLockedTeamsData(leagueCode),
    ]);
    const summaryData = buildRaceSummaryData(leagueData, lockedTeamsData);
    if (!leagueData || !summaryData.latestMatchday || summaryData.teams.length === 0) {
      return {
        status: 'missing_data',
        lang,
        leagueCode,
        leagueName: followedLeague.leagueName,
      };
    }

    try {
      const seasonData = await fetchCurrentSeasonRaces();
      summaryData.raceName = findRaceName(seasonData, summaryData.raceNumber);
    } catch (error) {
      // Race-name enrichment is optional and never blocks an otherwise valid
      // recap. Keep the technical detail in process logs, not the tool result.
      console.error(`Failed to load race name for agent summary: ${error.message}`);
    }

    let generated;
    try {
      generated = await generateRaceSummary({
        summaryData,
        language: lang,
        onUsage: ({ message }) => sendLogMessage(getNotifierBot(), message),
        onError: (error) =>
          sendErrorMessage(
            getNotifierBot(),
            `AzureOpenAI agent race summary error: ${error.message}`,
          ),
      });
    } catch {
      return {
        status: 'generation_error',
        lang,
        leagueCode,
        leagueName: summaryData.leagueName || followedLeague.leagueName,
      };
    }

    if (!generated.text) {
      await sendErrorMessage(
        getNotifierBot(),
        'AzureOpenAI agent race summary error: model returned empty output',
      );

      return {
        status: 'empty',
        lang,
        leagueCode,
        leagueName: summaryData.leagueName || followedLeague.leagueName,
      };
    }

    return {
      status: 'ok',
      lang,
      leagueCode,
      leagueName: summaryData.leagueName || followedLeague.leagueName,
      raceName: summaryData.raceName,
      raceNumber: summaryData.raceNumber,
      latestMatchday: summaryData.latestMatchday,
      truncated: generated.truncated,
      summary: generated.text,
    };
  }),
});

module.exports = { getRaceSummaryTool, publicLeague };
