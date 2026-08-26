const z = require('zod');
const { t } = require('../../i18n');
const {
  resolveTeamSelection,
  getFreshSelectedTeamPreference,
  selectTeamPreference,
} = require('../../services/selectTeamService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z
  .object({
    teamId: z.string().optional(),
    teamName: z.string().optional(),
  })
  .refine((args) => Boolean(args.teamId || args.teamName), {
    message: 'teamId or teamName is required',
  });

const selectTeamTool = defineWriteTool({
  name: 'select_team',
  description:
    'Change the signed-in user\'s active F1 Fantasy team. Pass teamId from list_user_teams when available, or an exact teamName. This write always requires the confirmation card unless that team is already active.',
  parameters,
  validate: async ({ chatId, args }) => {
    const resolved = resolveTeamSelection({ chatId, ...args });
    if (resolved.status !== 'ok') {
      return {
        status: WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'select_team',
        summary: resolved.summary,
        availableTeams: resolved.availableTeams,
      };
    }

    const [, current] = await Promise.all([
      getFreshLanguagePreference(chatId),
      getFreshSelectedTeamPreference(chatId),
    ]);
    if (current.fresh && current.selectedTeam === resolved.teamId) {
      return {
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'select_team',
        summary: t(
          'Active team is already {TEAM} ({TEAM_ID}).',
          chatId,
          {
            TEAM: resolved.teamName,
            TEAM_ID: resolved.teamId,
          },
        ),
        teamId: resolved.teamId,
        teamName: resolved.teamName,
        changed: false,
      };
    }

    return { args: { teamId: resolved.teamId } };
  },
  buildSummary: ({ chatId, args }) => {
    const resolved = resolveTeamSelection({ chatId, ...args });

    return t('Change your active team to {TEAM} ({TEAM_ID}).', chatId, {
      TEAM: resolved.teamName,
      TEAM_ID: resolved.teamId,
    });
  },
  commit: ({ chatId, args }) =>
    selectTeamPreference({ chatId, ...args }),
});

module.exports = { selectTeamTool };
