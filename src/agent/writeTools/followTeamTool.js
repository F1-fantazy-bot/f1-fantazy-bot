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
    leagueCode: z.string().trim().min(1).optional(),
    teamId: z.string().optional(),
    teamName: z.string().optional(),
  })
  .superRefine((args, ctx) => {
    if (Boolean(args.teamId) === Boolean(args.teamName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exactly one of teamId or teamName is required',
      });
    }
    if (args.action === 'add' && !args.leagueCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'leagueCode is required when adding a team',
      });
    }
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
    'Add or remove one followed F1 Fantasy team. Always pass exactly one canonical teamId or exact teamName. Adding requires leagueCode; removing by canonical teamId may omit leagueCode. The selected team is never an implicit target.',
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
