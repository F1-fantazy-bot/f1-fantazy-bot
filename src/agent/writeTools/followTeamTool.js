const z = require('zod');
const userTeamRegistryService = require('../../userTeamRegistryService');
const { listUserLeagues } = require('../../leagueRegistryService');
const {
  mapLeagueTeamToBotTeam,
  refreshLeagueTeamsData,
} = require('../../utils/leagueTeamHelpers');
const {
  ensureSourceIsLeagueWithStorage,
} = require('../../utils/teamSourceSwitcher');
const { sendLogMessage } = require('../../utils/utils');
const {
  createFollowTeamService,
} = require('../../services/followTeamService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getNotifierBot } = require('../notifierBot');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z
  .object({
    action: z.enum(['add', 'remove']),
    leagueCode: z.string().trim().min(1),
    teamId: z.string().optional(),
    teamName: z.string().optional(),
  })
  .refine((args) => Boolean(args.teamId) !== Boolean(args.teamName), {
    message: 'exactly one of teamId or teamName is required',
  });

function createAgentFollowTeamService() {
  return createFollowTeamService({
    storage: userTeamRegistryService,
    logger: (message) => sendLogMessage(getNotifierBot(), message),
    sourceSwitcher: (chatId) =>
      ensureSourceIsLeagueWithStorage(chatId, userTeamRegistryService),
    listUserLeagues,
    loadLeagueTeamsData: refreshLeagueTeamsData,
    mapLeagueTeamToBotTeam,
  });
}

const followTeamTool = defineWriteTool({
  name: 'follow_team',
  description:
    'Add or remove one followed F1 Fantasy team. action must be add or remove. Always pass an explicit leagueCode plus exactly one exact canonical teamId or exact teamName. The selected team is irrelevant: adding follows another team and never defaults to the active team.',
  parameters,
  validate: async ({ chatId, args }) => {
    await getFreshLanguagePreference(chatId);
    const service = createAgentFollowTeamService();
    const inspected = await service.inspect({ chatId, ...args });
    if (inspected.status !== 'ok') {
      return {
        ...inspected,
        status:
          inspected.status === 'not_found'
            ? WRITE_RESULT_STATUSES.NOT_FOUND
            : inspected.status === 'limit_exceeded'
              ? WRITE_RESULT_STATUSES.LIMIT_EXCEEDED
              : WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'follow_team',
      };
    }
    if (!inspected.changed) {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'follow_team',
      };
    }

    const canonicalArgs = {
      action: args.action,
      leagueCode: inspected.leagueCode,
      teamId: inspected.teamId,
    };

    return {
      args: canonicalArgs,
      intentArgs: {
        ...canonicalArgs,
        expectedScreenshotTeamIds: inspected.screenshotTeamIds,
      },
      summary: service.buildSummary(chatId, {
        ...inspected,
        action: args.action,
      }),
    };
  },
  buildSummary: ({ chatId, args }) => {
    const service = createAgentFollowTeamService();
    const team = {
      action: args.action,
      teamId: args.teamId,
      teamName: args.teamName || args.teamId,
      leagueCode: args.leagueCode,
      leagueName: args.leagueCode,
      screenshotTeamIds: [],
    };

    return service.buildSummary(chatId, team);
  },
  commit: ({ chatId, args }) =>
    createAgentFollowTeamService().mutate({ chatId, ...args }),
});

module.exports = {
  createAgentFollowTeamService,
  followTeamTool,
};
