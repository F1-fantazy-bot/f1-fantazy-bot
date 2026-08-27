const z = require('zod');
const { t } = require('../../i18n');
const {
  resolveTeamSelection,
  resolveFreshTeamSelection,
} = require('../../services/selectTeamService');
const {
  getChipOption,
  availableChips,
  getFreshChipPreference,
  activateChipPreference,
} = require('../../services/activateChipService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z.object({
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  chip: z.string(),
});

const activateChipTool = defineWriteTool({
  name: 'activate_chip',
  description:
    'Activate or reset the chip for one owned F1 Fantasy team. Omit teamId/teamName to use the user\'s currently selected team automatically. Pass teamId or an exact teamName only when the user explicitly requests a different team. chip must be EXTRA_BOOST, LIMITLESS, WILDCARD, or WITHOUT_CHIP (reset/no chip). This write requires confirmation unless that chip state is already active.',
  parameters,
  validate: async ({ chatId, args }) => {
    const resolvedTeam = await resolveFreshTeamSelection({
      chatId,
      ...args,
      defaultToSelected: true,
    });
    if (resolvedTeam.status !== 'ok') {
      return {
        status: WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'activate_chip',
        summary: resolvedTeam.summary,
        availableTeams: resolvedTeam.availableTeams,
      };
    }
    const chipOption = getChipOption(args.chip);
    if (!chipOption) {
      const chips = availableChips(chatId);

      return {
        status: WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'activate_chip',
        summary: t(
          'Chip {CHIP} is not available. Available chips: {CHIPS}.',
          chatId,
          {
            CHIP: args.chip,
            CHIPS: chips
              .map((option) => `${option.label} (${option.chip})`)
              .join(', '),
          },
        ),
        availableChips: chips,
      };
    }

    const [, current] = await Promise.all([
      getFreshLanguagePreference(chatId),
      getFreshChipPreference(chatId, resolvedTeam.teamId),
    ]);
    if (current.fresh && current.chip === chipOption.chip) {
      return {
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'activate_chip',
        summary: t('Chip for {TEAM} is already {CHIP}.', chatId, {
          TEAM: resolvedTeam.teamName,
          CHIP: t(chipOption.labelKey, chatId),
        }),
        teamId: resolvedTeam.teamId,
        teamName: resolvedTeam.teamName,
        chip: chipOption.chip,
        chipLabel: t(chipOption.labelKey, chatId),
        changed: false,
      };
    }

    return {
      args: {
        teamId: resolvedTeam.teamId,
        chip: chipOption.chip,
      },
    };
  },
  buildSummary: ({ chatId, args }) => {
    const resolvedTeam = resolveTeamSelection({ chatId, ...args });
    const chipOption = getChipOption(args.chip);

    return t('Change chip for {TEAM} to {CHIP}.', chatId, {
      TEAM: resolvedTeam.teamName,
      CHIP: t(chipOption.labelKey, chatId),
    });
  },
  commit: ({ chatId, args }) =>
    activateChipPreference({ chatId, ...args }),
});

module.exports = { activateChipTool };
