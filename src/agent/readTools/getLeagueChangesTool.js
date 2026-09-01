const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const {
  compareLeagueChanges,
} = require('../../cores/leagueChangesCore');
const { listUserLeagues } = require('../../leagueRegistryService');
const {
  getLockedTeamsData,
  getLeagueTeamsData,
} = require('../../azureStorageService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');

function publicLeague(league) {
  return {
    leagueCode: league.leagueCode,
    leagueName: league.leagueName || league.leagueCode,
  };
}

const getLeagueChangesTool = defineTool({
  name: 'get_league_changes',
  description:
    'Compare each team\'s Monday planning roster with the locked roster for the current matchday in one followed league. Pass a canonical leagueCode only when the user provided or selected one. If leagueCode is omitted, the result contains the user\'s followed leagues for clickable selection. Returns structured driver/constructor transfers, captain and mega-captain changes, current-matchday chips, new teams, and unchanged teams. Statuses: select_league, no_followed_leagues, not_followed, missing_locked, missing_planning, matchday_mismatch, or ok.',
  parameters: z.object({
    leagueCode: z
      .string()
      .optional()
      .describe(
        'Canonical code of a followed league. Omit it to render clickable followed-league cards.',
      ),
  }),
  execute: wrapToolExecute('get_league_changes', async (args) => {
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

    // Let wrapToolExecute own unexpected storage failures. It logs the full
    // exception privately and returns a localized envelope without Azure data.
    const [latest, planning] = await Promise.all([
      getLockedTeamsData(leagueCode),
      getLeagueTeamsData(leagueCode),
    ]);
    const comparison = compareLeagueChanges({ latest, planning });

    return {
      ...comparison,
      lang,
      leagueCode,
      leagueName:
        comparison.leagueName || followedLeague.leagueName || leagueCode,
    };
  }),
});

module.exports = { getLeagueChangesTool, publicLeague };
