const z = require('zod');
const { t } = require('../../i18n');
const {
  inspectLeagueFollow,
  followLeague,
} = require('../../services/followLeagueService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z.object({
  leagueCode: z.string(),
});

const followLeagueTool = defineWriteTool({
  name: 'follow_league',
  description:
    'Follow an F1 Fantasy league by its share code. Pass the leagueCode exactly as provided by the user; the service trims and uppercases it, verifies the league data exists, and requires confirmation unless already followed.',
  parameters,
  validate: async ({ chatId, args }) => {
    await getFreshLanguagePreference(chatId);
    const inspected = await inspectLeagueFollow({
      chatId,
      leagueCode: args.leagueCode,
    });
    if (inspected.status === 'invalid_input') {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'follow_league',
      };
    }
    if (inspected.status === 'not_found') {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.NOT_FOUND,
        tool: 'follow_league',
      };
    }
    if (!inspected.changed) {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'follow_league',
      };
    }

    return { args: { leagueCode: inspected.leagueCode } };
  },
  buildSummary: ({ chatId, args }) =>
    t('Follow league code {CODE}.', chatId, {
      CODE: args.leagueCode,
    }),
  commit: ({ chatId, args }) => followLeague({ chatId, ...args }),
});

module.exports = { followLeagueTool };
