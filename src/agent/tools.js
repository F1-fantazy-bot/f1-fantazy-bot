// CopilotKit v2 tool catalogue for the agent.
//
// Each tool uses `defineTool` from `@copilotkit/runtime/v2`:
//   { name, description, parameters: zodSchema, execute: (args) => any }
//
// The `parameters` field accepts any Standard Schema V1 library (Zod,
// Valibot, ArkType…). We use Zod because it's already a transitive dep
// via @copilotkit/runtime.
//
// `execute` calls into pure cores in `src/cores/*` — handlers must NOT
// import anything Telegram-specific.

const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { getNextRaces } = require('../cores/nextRacesCore');
const { computeBestTeams } = require('../cores/bestTeamsCore');
const { listUserTeams } = require('../cores/userTeamsCore');
const { getAgentChatId } = require('./identity');
const { ensureCacheReady } = require('./cacheBootstrap');

// Trim a best-teams calculator row down to the fields the React component
// actually renders. Sending the full driver/constructor dictionaries (which
// the calculator pulls in transitively through its inputs) would balloon
// the streamed tool payload for no benefit.
function summariseBestTeam(team) {
  return {
    row: team.row,
    drivers: team.drivers,
    constructors: team.constructors,
    boostDriver: team.boost_driver,
    extraBoostDriver: team.extra_boost_driver || null,
    totalPrice: Number(team.total_price?.toFixed?.(2) ?? team.total_price),
    transfersNeeded: team.transfers_needed,
    penalty: team.penalty,
    projectedPoints: Number(
      team.projected_points?.toFixed?.(2) ?? team.projected_points,
    ),
    budgetAdjustedPoints:
      typeof team.budget_adjusted_points === 'number'
        ? Number(team.budget_adjusted_points.toFixed(2))
        : null,
    expectedPriceChange:
      typeof team.expected_price_change === 'number'
        ? Number(team.expected_price_change.toFixed(2))
        : null,
    pointsPerMillion:
      team.total_price > 0
        ? Number((team.projected_points / team.total_price).toFixed(3))
        : null,
  };
}

const tools = [
  defineTool({
    name: 'get_next_races',
    description:
      'Get the list of upcoming F1 races for the current season. Returns the season, an array of race objects (each with round, raceName, date/time, Circuit.circuitName, Circuit.Location.locality, Circuit.Location.country, and per-session schedules), and counts {total, sprint}. Use this for any question about upcoming races, race dates, locations, or country filtering — apply filters and sorting yourself on the returned array.',
    parameters: z.object({}),
    execute: async () => {
      return getNextRaces();
    },
  }),

  defineTool({
    name: 'list_user_teams',
    description:
      'List the F1 Fantasy teams the user is tracking. Returns an array of teams with `teamId` (canonical identifier — pass this to other tools), `teamName` (friendly label like "kilzid3"), `isSelected`, `chip`, current drivers, current constructors, and roster metadata. ALWAYS call this first when the user mentions a team by name so you can resolve the name to a teamId before calling `get_best_teams`.',
    parameters: z.object({}),
    execute: async () => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return { teams: listUserTeams({ chatId }) };
    },
  }),

  defineTool({
    name: 'get_best_teams',
    description:
      'Compute the top scoring F1 Fantasy teams the user could field next race. Supports must-include / must-exclude filters on drivers and constructors so you can answer questions like "best teams with Verstappen but no Alonso". Pass driver/constructor codes (e.g. VER, ALO, MCL, FER) — full names like "Verstappen" or "McLaren" are also accepted but codes are safer. Identify the user\'s team by `teamId` (preferred, obtained from list_user_teams) or `teamName` (exact match). Result shape: { status, teamId, teamName, chip, rankBy, bestTeams: [...] }. On status "unknown_filter" the result includes a `filters` field listing which inputs failed to resolve — tell the user which names you could not map.',
    parameters: z.object({
      teamId: z
        .string()
        .optional()
        .describe(
          'Canonical team identifier returned by list_user_teams. Preferred over teamName.',
        ),
      teamName: z
        .string()
        .optional()
        .describe(
          'Exact teamName from list_user_teams. Used only when teamId is not provided.',
        ),
      rankBy: z
        .enum(['points', 'budget_adjusted', 'points_per_million'])
        .optional()
        .describe(
          'Sort criterion. Defaults to the user\'s preferred ranking (matching the Telegram bot). Use "points" for raw projected points, "points_per_million" for value-for-money, "budget_adjusted" for the budget-adjusted score.',
        ),
      mustIncludeDrivers: z
        .array(z.string())
        .optional()
        .describe('Driver codes the team MUST contain (e.g. ["VER"]).'),
      mustExcludeDrivers: z
        .array(z.string())
        .optional()
        .describe('Driver codes the team MUST NOT contain.'),
      mustIncludeConstructors: z
        .array(z.string())
        .optional()
        .describe(
          'Constructor codes the team MUST contain (e.g. ["MCL"]).',
        ),
      mustExcludeConstructors: z
        .array(z.string())
        .optional()
        .describe('Constructor codes the team MUST NOT contain.'),
    }),
    execute: async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();
      // Web component renders up to 10 teams at a time — anything beyond
      // that bloats the streamed tool payload and the LLM context.
      const result = await computeBestTeams({
        chatId,
        teamId: args.teamId,
        teamName: args.teamName,
        rankBy: args.rankBy ?? null,
        resultCount: 10,
        mustIncludeDrivers: args.mustIncludeDrivers,
        mustExcludeDrivers: args.mustExcludeDrivers,
        mustIncludeConstructors: args.mustIncludeConstructors,
        mustExcludeConstructors: args.mustExcludeConstructors,
      });

      if (result.status !== 'ok') {
        // Strip caches/heavy fields out of non-ok results — the LLM only
        // needs the status + the identifiers to phrase its reply.
        const { currentTeam: _currentTeam, ...rest } = result;

        return rest;
      }

      return {
        status: 'ok',
        teamId: result.teamId,
        teamName: result.teamName,
        chip: result.chip || null,
        rankBy: result.rankBy,
        budgetChangePointsPerMillion: result.budgetChangePointsPerMillion,
        filters: {
          mustIncludeDrivers: result.filters.mustIncludeDrivers.resolved,
          mustExcludeDrivers: result.filters.mustExcludeDrivers.resolved,
          mustIncludeConstructors:
            result.filters.mustIncludeConstructors.resolved,
          mustExcludeConstructors:
            result.filters.mustExcludeConstructors.resolved,
        },
        bestTeams: result.bestTeams.map(summariseBestTeam),
      };
    },
  }),
];

module.exports = { tools };

