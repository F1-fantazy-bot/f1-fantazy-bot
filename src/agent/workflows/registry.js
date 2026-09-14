const { createHash } = require('crypto');
const { getWorkflowWriteAdapter } = require('../writeToolHelpers');
const { ensureCacheReady } = require('../cacheBootstrap');
const {
  resolveFreshTeamSelection,
} = require('../../services/selectTeamService');
const {
  hydrateUserMutationState,
} = require('../../services/userMutationHydrationService');
const { getLanguage } = require('../../i18n');
const { currentTeamCache, userCache } = require('../../cache');
const TEAM_TOOLS = new Set([
  'select_team',
  'activate_chip',
  'set_best_team_ranking',
  'get_best_teams',
  'get_best_team_scenarios',
  'get_current_team',
]);
const { listUserLeagues } = require('../../leagueRegistryService');
const { getActionChoices } = require('../readTools/getActionChoicesTool');
const LEAGUE_TOOLS = new Set([
  'get_leaderboard',
  'get_live_score_for_team',
  'get_live_score_leaderboard',
  'list_league_teams',
  'get_league_changes',
  'get_league_graph',
  'get_race_summary',
  'unfollow_league',
]);
const EXCLUDED = new Set([
  'confirm_write',
  'get_action_choices',
  'propose_workflow',
]);
const READ_LABELS = {
  get_best_teams: ['Calculate best teams', 'חישוב קבוצות מיטביות'],
  get_current_team: ['Show current team', 'הצגת הקבוצה הנוכחית'],
  get_best_team_scenarios: [
    'Compare chip and ranking scenarios',
    'השוואת תרחישי צ׳יפ ודירוג',
  ],
  get_leaderboard: ['Show league standings', 'הצגת דירוג הליגה'],
  get_next_races: ['Show upcoming races', 'הצגת המרוצים הבאים'],
  get_next_race_info: ['Show next race information', 'הצגת מידע על המרוץ הבא'],
  get_race_weather: ['Show race weather', 'הצגת מזג האוויר במרוץ'],
  get_deadline: ['Show team lock deadline', 'הצגת מועד נעילת הקבוצות'],
  list_user_teams: ['Show saved teams', 'הצגת הקבוצות השמורות'],
  list_followed_teams: ['Show followed teams', 'הצגת קבוצות במעקב'],
  list_user_leagues: ['Show followed leagues', 'הצגת ליגות במעקב'],
  list_league_teams: ['Show league teams', 'הצגת קבוצות הליגה'],
  get_live_score_for_team: ['Show team live score', 'הצגת ניקוד חי לקבוצה'],
  get_live_score_leaderboard: [
    'Show live league standings',
    'הצגת דירוג חי לליגה',
  ],
  get_league_changes: [
    'Show league roster changes',
    'הצגת שינויי הרכבים בליגה',
  ],
  get_league_graph: ['Show league chart', 'הצגת גרף הליגה'],
  get_race_summary: ['Summarize the race', 'סיכום המרוץ'],
  get_whats_new: ['Show announcements', 'הצגת עדכונים'],
  get_simulation_status: ['Show simulation status', 'הצגת מצב הסימולציה'],
  get_data_status: ['Show data status', 'הצגת מצב הנתונים'],
  get_agent_guide: ['Show the agent guide', 'הצגת מדריך העוזר'],
  get_admin_version: ['Show application version', 'הצגת גרסת היישום'],
  get_billing_stats: ['Show billing statistics', 'הצגת נתוני חיוב'],
  list_bot_users: ['Show registered users', 'הצגת משתמשים רשומים'],
  list_web_users: ['Show web users', 'הצגת משתמשי הווב'],
  get_botfather_setup: ['Show bot configuration', 'הצגת הגדרות הבוט'],
  get_language: ['Show saved language', 'הצגת השפה השמורה'],
  get_best_team_changes: [
    'Show recommendation transfers',
    'הצגת העברות מומלצות',
  ],
};
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function stateFingerprint(owner, args, tool) {
  const user = userCache[String(owner)] || {};
  const team = currentTeamCache[owner]?.[args.teamId];

  // Saved intent changes invalidate authorization. Live projections, prices,
  // weather and simulation versions deliberately do not.
  return hash({
    selected: tool === 'select_team' ? user.selectedTeam : undefined,
    chip: args.teamId ? user.selectedChipByTeam?.[args.teamId] : undefined,
    ranking: args.teamId
      ? user.bestTeamBudgetChangePointsPerMillion?.[args.teamId]
      : undefined,
    source: team
      ? {
          teamName: team.teamName,
          leagueCode: team.leagueCode,
          teamId: team.teamId,
          source: team.source,
        }
      : null,
    selectedBest:
      args.teamId && tool === 'activate_chip'
        ? user.selectedBestTeamByTeam?.[args.teamId]
        : undefined,
    language: tool === 'set_language' ? user.lang : undefined,
    resetEpoch: user.userResetEpoch,
    owned: args.teamId ? Boolean(team) : undefined,
  });
}
function createRegistry(tools) {
  const registry = new Map();
  for (const tool of tools) {
    if (EXCLUDED.has(tool.name)) {
      continue;
    }
    const writer = getWorkflowWriteAdapter(tool.name);
    if (writer && !writer.prepare) {
      continue;
    }
    const asynchronous = tool.name.startsWith('trigger_');
    const adapter = {
      write: Boolean(writer),
      async prepare(owner, raw, context = {}) {
        await ensureCacheReady();
        await hydrateUserMutationState(owner);
        let args = { ...raw };
        let label = '';
        if (TEAM_TOOLS.has(tool.name)) {
          if (!args.teamId && !args.teamName && context.teamId) {
            args.teamId = context.teamId;
          }
          const target = await resolveFreshTeamSelection({
            chatId: owner,
            teamId: args.teamId,
            teamName: args.teamName,
            defaultToSelected: tool.name !== 'select_team',
          });
          if (target.status !== 'ok') {
            return { ...target, status: 'invalid_input', tool: tool.name };
          }
          args.teamId = target.teamId;
          delete args.teamName;
          label = target.teamName;
        }
        if (
          LEAGUE_TOOLS.has(tool.name) ||
          (tool.name === 'follow_team' && args.action === 'add')
        ) {
          const leagues = await listUserLeagues(owner);
          const matches = leagues.filter((league) =>
            args.leagueCode
              ? league.leagueCode === args.leagueCode
              : args.leagueName &&
                league.leagueName?.toLowerCase() ===
                  args.leagueName.toLowerCase(),
          );
          if (matches.length !== 1) {
            return {
              status: 'selection_required',
              choice: 'league',
              lang: getLanguage(owner),
              options: leagues.map((league) => ({
                action: tool.name,
                label: league.leagueName || league.leagueCode,
                args: {
                  ...args,
                  leagueCode: league.leagueCode,
                  leagueName: undefined,
                },
              })),
            };
          }
          args.leagueCode = matches[0].leagueCode;
          delete args.leagueName;
          label = matches[0].leagueName || args.leagueCode;
          if (tool.name === 'get_live_score_for_team' && !args.teamId) {
            return getActionChoices({
              action: tool.name,
              choice: 'team',
              context: args,
            });
          }
        }
        if (tool.name === 'get_league_graph' && !args.graphType) {
          return {
            status: 'selection_required',
            choice: 'graph',
            lang: getLanguage(owner),
            options: [
              ['gap', 'Gap to leader', 'פער מהמוביל'],
              ['standings', 'Standings', 'מיקום בדירוג'],
              ['budget', 'Budget', 'תקציב'],
            ].map(([graphType, en, he]) => ({
              action: tool.name,
              label: getLanguage(owner) === 'he' ? he : en,
              args: { ...args, graphType },
            })),
          };
        }
        if (tool.name === 'follow_team' && !args.teamId && !args.teamName) {
          const list = tools.find(
            (candidate) =>
              candidate.name ===
              (args.action === 'add'
                ? 'list_league_teams'
                : 'list_followed_teams'),
          );
          const result = await list.execute(
            args.action === 'add'
              ? { leagueCode: args.leagueCode, selectionMode: 'follow_team' }
              : {},
          );
          if (result.status !== 'ok') {
            return result;
          }

          return {
            status: 'selection_required',
            choice: 'team',
            lang: getLanguage(owner),
            options: result.teams.map((team) => ({
              action: tool.name,
              label: team.teamName || team.teamId,
              args: { ...args, teamId: team.teamId },
            })),
          };
        }
        if (
          ['activate_chip', 'set_best_team_ranking'].includes(tool.name) &&
          !(tool.name === 'activate_chip' ? args.chip : args.presetId)
        ) {
          return getActionChoices({
            action: tool.name,
            choice: tool.name === 'activate_chip' ? 'chip' : 'preset',
            context: args,
          });
        }
        if (
          ['send_user_message', 'set_user_nickname', 'allow_web_user'].includes(
            tool.name,
          ) &&
          !/^-?\d+$/.test(args.chatId || '')
        ) {
          const directoryTool = tools.find(
            (candidate) => candidate.name === 'list_bot_users',
          );
          const directory = await directoryTool.execute({});
          if (directory.status !== 'ok') {
            return directory;
          }

          return {
            status: 'selection_required',
            choice: 'recipient',
            lang: getLanguage(owner),
            options: directory.directory.users.map((user) => ({
              action: tool.name,
              label: user.nickname || user.chatName || user.chatId,
              detail: user.chatId,
              args: { ...args, chatId: user.chatId },
            })),
          };
        }
        let prepared;
        if (writer) {
          prepared = await writer.prepare({ chatId: owner, rawArgs: args });
          if (
            prepared.status &&
            !(prepared.status === 'ok' && prepared.changed === false)
          ) {
            if (prepared.followedLeagues) {
              return {
                status: 'selection_required',
                choice: 'league',
                lang: getLanguage(owner),
                options: prepared.followedLeagues.map((league) => ({
                  action: tool.name,
                  label: league.leagueName || league.leagueCode,
                  args: { ...args, leagueCode: league.leagueCode },
                })),
              };
            }
            if (prepared.availableTeams) {
              return {
                status: 'selection_required',
                choice: 'team',
                lang: getLanguage(owner),
                options: prepared.availableTeams.map((team) => ({
                  action: tool.name,
                  label: team.teamName || team.teamId,
                  args: {
                    ...args,
                    teamId: team.teamId,
                    teamName: undefined,
                    ...(team.leagueCode ? { leagueCode: team.leagueCode } : {}),
                  },
                })),
              };
            }

            return prepared;
          }
        } else {
          args = tool.parameters.parse(args);
          if (tool.name === 'get_best_teams') {
            const chipStep = [...(context.priorSteps || [])]
              .reverse()
              .find(
                (step) =>
                  step.tool === 'activate_chip' &&
                  step.args.teamId === args.teamId,
              );
            if (args.chipOverride === undefined && chipStep) {
              args.chipOverride = chipStep.args.chip;
            }
            const { resolveCodes } = require('../../cores/bestTeamsCore');
            for (const field of [
              'mustIncludeDrivers',
              'mustExcludeDrivers',
              'mustIncludeConstructors',
              'mustExcludeConstructors',
            ]) {
              if (args[field] === undefined) {
                continue;
              }
              const resolved = resolveCodes(args[field]);
              if (resolved.unknown.length) {
                return {
                  status: 'invalid_input',
                  summary:
                    getLanguage(owner) === 'he'
                      ? 'לא ניתן לזהות חלק מהנהגים או הקבוצות שבסינון.'
                      : 'Some requested drivers or constructors could not be identified.',
                };
              }
              args[field] = resolved.resolved;
            }
            if (
              ['Drivers', 'Constructors'].some((kind) =>
                (args[`mustInclude${kind}`] || []).some((code) =>
                  (args[`mustExclude${kind}`] || []).includes(code),
                ),
              )
            ) {
              return {
                status: 'invalid_input',
                summary:
                  getLanguage(owner) === 'he'
                    ? 'לא ניתן לכלול ולהחריג את אותו פריט.'
                    : 'The same driver or constructor cannot be both included and excluded.',
              };
            }
          }
          args = tool.parameters.parse(args);
          prepared = {
            args,
            summary: `${READ_LABELS[tool.name]?.[getLanguage(owner) === 'he' ? 1 : 0] || tool.description.split('.')[0]}${label ? ` — ${label}` : ''}`,
          };
        }
        const satisfied =
          prepared.status === 'ok' && prepared.changed === false;
        const canonical = prepared.args || args;
        const lang = getLanguage(owner);
        let summary =
          satisfied &&
          context.priorSteps?.some((step) => step.write) &&
          writer?.describe
            ? writer.describe({ chatId: owner, args: canonical })
            : prepared.summary;
        if (typeof canonical.message === 'string') {
          summary = `${summary.split('\n\n')[0]}\n\n${canonical.message}`;
        }
        if (tool.name === 'activate_chip' && !satisfied) {
          summary +=
            lang === 'he'
              ? ' מעדכן את בחירת הצ׳יפ ומנקה את ההמלצה שנבחרה קודם.'
              : ' Updates your saved chip preference and clears the previous recommendation selection.';
        }

        return {
          args: canonical,
          ...(prepared.preview ? { preview: prepared.preview } : {}),
          intentArgs: prepared.intentArgs || canonical,
          summary,
          uiLang: lang,
          satisfied: satisfied && !context.priorSteps?.some((s) => s.write),
          precondition: stateFingerprint(owner, canonical, tool.name),
          ...(satisfied ? { satisfiedResult: prepared } : {}),
        };
      },
      async revalidate(owner, step) {
        const current = await adapter.prepare(owner, step.args);
        if (current.status) {
          return { valid: false, failure: current };
        }
        const sameIntent = hash(current.intentArgs) === hash(step.intentArgs);

        return {
          valid:
            sameIntent &&
            !(step.satisfied && !current.satisfied) &&
            current.precondition === step.precondition,
          satisfied: current.satisfied,
          result: current.satisfiedResult,
        };
      },
      async afterWrite(owner, step) {
        await hydrateUserMutationState(owner);
        step.precondition = stateFingerprint(owner, step.args, tool.name);
      },
      async reconcile(owner, step) {
        if (
          ![
            'activate_chip',
            'select_team',
            'set_best_team_ranking',
            'set_language',
          ].includes(tool.name)
        ) {
          return null;
        }
        const observed = await adapter.prepare(owner, step.args);
        if (!observed.satisfied) {
          return null;
        }
        if (
          tool.name === 'activate_chip' &&
          userCache[String(owner)]?.selectedBestTeamByTeam?.[step.args.teamId]
        ) {
          return null;
        }

        return observed.satisfiedResult;
      },
      execute: (owner, step) =>
        writer
          ? writer.commit({ chatId: owner, args: step.intentArgs })
          : tool.execute(step.args),
      success: (result) =>
        Boolean(result) &&
        !asynchronous &&
        (result.status === 'ok' ||
          (!result.status && typeof result === 'object')),
      started: (result) => asynchronous && result?.status === 'ok',
    };
    registry.set(tool.name, adapter);
  }

  return registry;
}
module.exports = { createRegistry, stateFingerprint };
