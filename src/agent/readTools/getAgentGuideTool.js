const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { isAdminChatId } = require('../../adminIdentity');
const {
  getUserTeamIds,
  getUserLeagueTeamIds,
  getDriversForChat,
  getConstructorsForChat,
  currentTeamCache,
  simulationInfoCache,
  sharedKey,
} = require('../../cache');
const {
  buildAgentGuide,
  GUIDE_TOPICS,
} = require('../../cores/agentGuideCore');
const { listUserTeams } = require('../../cores/userTeamsCore');
const { listUserLeagues } = require('../../leagueRegistryService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');

function hasEntries(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.keys(value).length > 0
  );
}

const getAgentGuideTool = defineTool({
  name: 'get_agent_guide',
  description:
    'Show a personalized guide to what the F1 Fantasy agent can do. Use for help, getting-started, usage, capability, or "what can you do" questions. Optional topic: getting_started, teams, leagues, races, settings, or admin.',
  parameters: z.object({
    topic: z.enum(GUIDE_TOPICS).optional(),
  }),
  execute: wrapToolExecute('get_agent_guide', async (args) => {
    await ensureCacheReady();
    const chatId = getAgentChatId();
    const [{ lang }, leagues] = await Promise.all([
      getFreshLanguagePreference(chatId),
      listUserLeagues(chatId),
    ]);
    const teams = listUserTeams({ chatId });
    const teamsWithFriendlyNames = teams.filter((team) => {
      const cachedName = currentTeamCache[chatId]?.[team.teamId]?.teamName;

      return typeof cachedName === 'string' && cachedName.trim().length > 0;
    });
    const selectedTeam = teamsWithFriendlyNames.find(
      (team) => team.isSelected,
    );

    return buildAgentGuide({
      lang,
      topic: args.topic,
      isAdmin: isAdminChatId(chatId),
      teamCount: getUserTeamIds(chatId).length,
      followedTeamCount: getUserLeagueTeamIds(chatId).length,
      leagueCount: leagues.length,
      hasSimulationData: Boolean(simulationInfoCache[sharedKey]),
      hasProjectionData:
        hasEntries(getDriversForChat(chatId)) &&
        hasEntries(getConstructorsForChat(chatId)),
      selectedTeamName: selectedTeam?.teamName || '',
      teamNames: teamsWithFriendlyNames.map((team) => team.teamName),
      leagueNames: leagues.map(
        (league) => league.leagueName || league.leagueCode,
      ),
    });
  }),
});

module.exports = { getAgentGuideTool, hasEntries };
