const z = require('zod');
const { t } = require('../../i18n');
const {
  resolveTeamSelection,
  resolveFreshTeamSelection,
} = require('../../services/selectTeamService');
const {
  getPreset,
  availablePresets,
  getFreshBestTeamRankingPreference,
  setBestTeamRankingPreference,
} = require('../../services/setBestTeamRankingService');
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
  presetId: z.string(),
});

const setBestTeamRankingTool = defineWriteTool({
  name: 'set_best_team_ranking',
  description:
    'Change how expected budget growth influences best-team ranking for one owned team. Omit teamId/teamName to use the user\'s currently selected team automatically. Pass teamId or an exact teamName only when the user explicitly requests a different team. presetId must be one of: pure_points (0), points_lean (1.3), points_plus_budget (1.65), balanced_budget_value (2). This write requires confirmation unless that preset is already active.',
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
        tool: 'set_best_team_ranking',
        summary: resolvedTeam.summary,
        availableTeams: resolvedTeam.availableTeams,
      };
    }
    const preset = getPreset(args.presetId);
    if (!preset) {
      return {
        status: WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'set_best_team_ranking',
        summary: t(
          'Ranking preset {PRESET} is not available. Available presets: {PRESETS}.',
          chatId,
          {
            PRESET: args.presetId,
            PRESETS: availablePresets(chatId)
              .map((option) => `${option.label} (${option.id})`)
              .join(', '),
          },
        ),
        availablePresets: availablePresets(chatId),
      };
    }

    const [, current] = await Promise.all([
      getFreshLanguagePreference(chatId),
      getFreshBestTeamRankingPreference(chatId, resolvedTeam.teamId),
    ]);
    if (
      current.fresh &&
      current.value === preset.budgetChangePointsPerMillion
    ) {
      return {
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'set_best_team_ranking',
        summary: t(
          'Best-team ranking for {TEAM} is already {LABEL} ({VALUE} pts per 1M per remaining race).',
          chatId,
          {
            TEAM: resolvedTeam.teamName,
            LABEL: t(preset.labelKey, chatId),
            VALUE: preset.budgetChangePointsPerMillion,
          },
        ),
        teamId: resolvedTeam.teamId,
        teamName: resolvedTeam.teamName,
        presetId: preset.id,
        label: t(preset.labelKey, chatId),
        value: preset.budgetChangePointsPerMillion,
        changed: false,
      };
    }

    return {
      args: {
        teamId: resolvedTeam.teamId,
        presetId: preset.id,
      },
    };
  },
  buildSummary: ({ chatId, args }) => {
    const resolvedTeam = resolveTeamSelection({ chatId, ...args });
    const preset = getPreset(args.presetId);

    return t(
      'Change best-team ranking for {TEAM} to {LABEL} ({VALUE} pts per 1M per remaining race).',
      chatId,
      {
        TEAM: resolvedTeam.teamName,
        LABEL: t(preset.labelKey, chatId),
        VALUE: preset.budgetChangePointsPerMillion,
      },
    );
  },
  commit: ({ chatId, args }) =>
    setBestTeamRankingPreference({ chatId, ...args }),
});

module.exports = { setBestTeamRankingTool };
