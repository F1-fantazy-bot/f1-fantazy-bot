const z = require('zod');
const { t } = require('../../i18n');
const {
  inspectLeagueUnfollow,
  unfollowLeague,
} = require('../../services/unfollowLeagueService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z
  .object({
    leagueCode: z.string().optional(),
    leagueName: z.string().optional(),
  })
  .refine((args) => Boolean(args.leagueCode || args.leagueName), {
    message: 'leagueCode or leagueName is required',
  });

const unfollowLeagueTool = defineWriteTool({
  name: 'unfollow_league',
  description:
    'Stop following one private F1 Fantasy league. Pass an exact leagueCode or exact leagueName. The service verifies the authenticated user follows it and requires confirmation before deletion.',
  parameters,
  validate: async ({ chatId, args }) => {
    await getFreshLanguagePreference(chatId);
    const inspected = await inspectLeagueUnfollow({ chatId, ...args });
    if (inspected.status !== 'ok') {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.NOT_FOUND,
        tool: 'unfollow_league',
      };
    }

    return {
      args: {
        leagueCode: inspected.leagueCode,
        leagueName: inspected.leagueName,
      },
    };
  },
  buildSummary: ({ chatId, args }) =>
    t('Unfollow league "{NAME}" ({CODE}).', chatId, {
      NAME: args.leagueName || args.leagueCode,
      CODE: args.leagueCode,
    }),
  commit: ({ chatId, args }) => unfollowLeague({ chatId, ...args }),
});

module.exports = { unfollowLeagueTool };
