// Read-only choice discovery. Targets come from the authenticated account;
// selecting a write target still goes through the ordinary confirmation tool.
const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { listUserLeagues } = require('../../leagueRegistryService');
const { listUserTeams } = require('../../cores/userTeamsCore');
const { listLeagueTeams } = require('../../cores/liveScoreCore');
const { getDriversForChat, getConstructorsForChat } = require('../../cache');
const {
  availablePresets,
} = require('../../services/setBestTeamRankingService');
const { availableChips } = require('../../services/activateChipService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');

const TEAM_ACTIONS = [
  'get_best_teams',
  'get_best_team_scenarios',
  'get_current_team',
  'select_team',
  'set_best_team_ranking',
  'activate_chip',
];
const LEAGUE_ACTIONS = [
  'get_leaderboard',
  'get_live_score_for_team',
  'get_live_score_leaderboard',
  'list_league_teams',
];
const ACTIONS = [...TEAM_ACTIONS, ...LEAGUE_ACTIONS, 'set_language'];
const contextSchema = z
  .object({
    leagueCode: z.string().optional(),
    leagueName: z.string().optional(),
    teamId: z.string().optional(),
    teamName: z.string().optional(),
    presetId: z.string().optional(),
    chip: z.string().optional(),
    rankBy: z.enum(['points', 'budget_adjusted']).optional(),
    mustIncludeDrivers: z.array(z.string()).optional(),
    mustExcludeDrivers: z.array(z.string()).optional(),
    mustIncludeConstructors: z.array(z.string()).optional(),
    mustExcludeConstructors: z.array(z.string()).optional(),
  })
  .strict();
const parameters = z.object({
  action: z.enum(ACTIONS),
  choice: z.enum([
    'team',
    'league',
    'preset',
    'chip',
    'language',
    'ranking',
    'include_driver',
    'exclude_driver',
    'include_constructor',
    'exclude_constructor',
  ]),
  context: contextSchema.optional(),
});

function choiceResult({ action, choice, context = {}, lang, options }) {
  return {
    status: 'selection_required',
    action,
    choice,
    lang,
    options: options.map(({ label, detail, args, action: optionAction }) => ({
      label,
      detail,
      action: optionAction || action,
      args: { ...context, ...args },
    })),
  };
}

async function getActionChoices(input) {
  const { action, choice, context = {} } = parameters.parse(input);
  await ensureCacheReady();
  const chatId = getAgentChatId();
  const { lang } = await getFreshLanguagePreference(chatId);
  let options;
  if (choice === 'league' && LEAGUE_ACTIONS.includes(action)) {
    options = ((await listUserLeagues(chatId)) || []).map((league) => ({
      label: league.leagueName || league.leagueCode,
      detail: league.leagueCode,
      args: { leagueCode: league.leagueCode, leagueName: undefined },
    }));
  } else if (choice === 'team' && TEAM_ACTIONS.includes(action)) {
    options = listUserTeams({ chatId }).map((team) => ({
      label: team.teamName,
      detail: team.teamId,
      args: { teamId: team.teamId, teamName: undefined },
    }));
  } else if (choice === 'team' && action === 'get_live_score_for_team') {
    if (
      (!context.leagueCode && !context.leagueName) ||
      (await hasAmbiguousLeagueName(chatId, context))
    ) {
      return await getActionChoices({ action, choice: 'league', context });
    }
    const result = await listLeagueTeams({ chatId, ...context });
    if (result.status !== 'ok') {
      // The legacy core may contain a technical error; allowlist the envelope.
      return { status: result.status, lang };
    }
    options = result.teams.map((team) => ({
      label: team.teamName,
      detail: team.teamId,
      args: {
        leagueCode: result.leagueCode,
        leagueName: undefined,
        teamId: team.teamId,
        teamName: undefined,
      },
    }));
    options.unshift({
      label: lang === 'he' ? 'כל הקבוצות בליגה' : 'All teams in this league',
      action: 'get_live_score_leaderboard',
      args: {
        leagueCode: result.leagueCode,
        leagueName: undefined,
        teamId: undefined,
        teamName: undefined,
      },
    });
  } else if (choice === 'preset' && action === 'set_best_team_ranking') {
    options = availablePresets(chatId).map((preset) => ({
      label: `${preset.label} (${preset.value})`,
      args: { presetId: preset.id },
    }));
  } else if (choice === 'chip' && action === 'activate_chip') {
    options = availableChips(chatId).map((chip) => ({
      label: chip.label,
      args: { chip: chip.chip },
    }));
  } else if (choice === 'language' && action === 'set_language') {
    options = [
      { label: 'English', args: { lang: 'en' } },
      { label: 'עברית', args: { lang: 'he' } },
    ];
  } else if (choice === 'ranking' && action === 'get_best_teams') {
    options = [
      {
        label: lang === 'he' ? 'נקודות חזויות' : 'Projected points',
        args: { rankBy: 'points' },
      },
      {
        label:
          lang === 'he' ? 'נקודות משוקללות תקציב' : 'Budget-adjusted points',
        args: { rankBy: 'budget_adjusted' },
      },
    ];
  } else if (
    action === 'get_best_teams' &&
    /^(include|exclude)_(driver|constructor)$/.test(choice)
  ) {
    options = filterChoices({ chatId, choice, context });
  } else {
    return { status: 'invalid_input', lang };
  }

  return choiceResult({ action, choice, context, lang, options });
}

function filterChoices({ chatId, choice, context }) {
  const driver = choice.endsWith('_driver');
  const field = `must${choice.startsWith('include') ? 'Include' : 'Exclude'}${driver ? 'Drivers' : 'Constructors'}`;
  const entries = driver
    ? getDriversForChat(chatId)
    : getConstructorsForChat(chatId);

  return Object.keys(entries || {})
    .sort()
    .map((code) => ({
      label: code,
      args: { [field]: [...new Set([...(context[field] || []), code])] },
    }));
}

async function hasAmbiguousLeagueName(chatId, args) {
  if (args.leagueCode || !args.leagueName) {
    return false;
  }
  const leagues = (await listUserLeagues(chatId)) || [];
  const name = args.leagueName.trim().toLowerCase();
  const exact = leagues.filter(
    (league) => league.leagueName?.toLowerCase() === name,
  );
  const matches = exact.length
    ? exact
    : leagues.filter((league) =>
        league.leagueName?.toLowerCase().includes(name),
      );

  return matches.length > 1;
}

// Missing inputs and unresolved read targets render their own choices in the
// same tool result, avoiding a second tool call whose rich UI could be dropped.
function wrapSelectableExecute(action, execute) {
  return wrapToolExecute(action, async (args = {}) => {
    if (args.selectionMode) {
      return await execute(args);
    }
    if (
      LEAGUE_ACTIONS.includes(action) &&
      !args.leagueCode &&
      !args.leagueName
    ) {
      return await getActionChoices({
        action,
        choice: 'league',
        context: args,
      });
    }
    if (
      LEAGUE_ACTIONS.includes(action) &&
      (await hasAmbiguousLeagueName(getAgentChatId(), args))
    ) {
      return await getActionChoices({
        action,
        choice: 'league',
        context: args,
      });
    }
    if (action === 'get_live_score_for_team' && !args.teamId && !args.teamName) {
      return await getActionChoices({ action, choice: 'team', context: args });
    }
    const result = await execute(args);
    if (
      ['ambiguous_team', 'unknown_team', 'team_not_found'].includes(
        result?.status,
      )
    ) {
      return await getActionChoices({ action, choice: 'team', context: args });
    }
    // Older read cores may attach raw storage errors to expected failures.
    const { error: _error, ...safeResult } = result || {};

    return safeResult;
  });
}

const getActionChoicesTool = defineTool({
  name: 'get_action_choices',
  description:
    'Show clickable choices for a pending action instead of asking the user to type an existing team, league, language, chip, or ranking preset. Pass the intended action and missing choice. Preserve already supplied filters/targets in context. This is read-only; choosing a write option only proposes it and still requires confirmation. Use existing guided directory/follow/graph tools for their own selection flows.',
  parameters,
  execute: wrapToolExecute('get_action_choices', getActionChoices),
});

module.exports = {
  getActionChoicesTool,
  getActionChoices,
  wrapSelectableExecute,
  choiceResult,
};
