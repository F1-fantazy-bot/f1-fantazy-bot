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
const {
  computeBestTeamScenarios,
} = require('../cores/bestTeamScenariosCore');
const { listUserTeams } = require('../cores/userTeamsCore');
const { listFollowedTeams } = require('../cores/followedTeamsCore');
const { getLeaderboard } = require('../cores/leaderboardCore');
const { getNextRaceInfo } = require('../cores/nextRaceInfoCore');
const { getRaceWeather } = require('../cores/raceWeatherCore');
const { getDeadlineSnapshot } = require('../cores/deadlineCore');
const { getCurrentTeam } = require('../cores/currentTeamCore');
const {
  getLiveScoreForTeam,
  getLiveScoreLeaderboard,
  listLeagueTeams,
} = require('../cores/liveScoreCore');
const { listUserLeagues } = require('../leagueRegistryService');
const {
  getFreshLanguagePreference,
} = require('../services/setLanguageService');
const { getAgentChatId } = require('./identity');
const { ensureCacheReady } = require('./cacheBootstrap');
const { wrapToolExecute } = require('./wrapToolExecute');
const { executeConfirmedWrite } = require('./writeToolHelpers');
const { setLanguageTool } = require('./writeTools/setLanguageTool');
const { getLanguageTool } = require('./readTools/getLanguageTool');

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
  };
}

const tools = [
  defineTool({
    name: 'get_next_races',
    description:
      'Get the list of upcoming F1 races for the current season. Returns the season, an array of race objects (each with round, raceName, date/time, Circuit.circuitName, Circuit.Location.locality, Circuit.Location.country, and per-session schedules), and counts {total, sprint}. Use this for any question about upcoming races, race dates, locations, or country filtering — apply filters and sorting yourself on the returned array.',
    parameters: z.object({}),
    execute: wrapToolExecute('get_next_races', async () => {
      return getNextRaces();
    }),
  }),

  defineTool({
    name: 'list_user_teams',
    description:
      'List the F1 Fantasy teams the user is tracking. Returns an array of teams with `teamId` (canonical identifier — pass this to other tools), `teamName` (friendly label like "kilzid3"), `isSelected`, `chip`, current drivers, current constructors, and roster metadata. ALWAYS call this first when the user mentions a team by name so you can resolve the name to a teamId before calling `get_best_teams`.',
    parameters: z.object({}),
    execute: wrapToolExecute('list_user_teams', async () => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return { teams: listUserTeams({ chatId }) };
    }),
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
        .enum(['points', 'budget_adjusted'])
        .optional()
        .describe(
          'Sort criterion. Defaults to the user\'s preferred ranking (matching the Telegram bot). Use "points" for raw projected points; use "budget_adjusted" for the budget-adjusted score that weights the team\'s expected price change by the user\'s saved budgetChangePointsPerMillion preference (set via /set_best_team_ranking). When the user asks for "points per million" sorting, that is the budget-adjusted ranking — call with rankBy="budget_adjusted".',
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
    execute: wrapToolExecute('get_best_teams', async (args) => {
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
    }),
  }),

  defineTool({
    name: 'get_best_team_scenarios',
    description:
      'Compare the top best team across the bot\'s 4 budget-adjusted weight presets (0, 1.3, 1.65, 2.0 points-per-million of expected price change) × 4 chip choices (no chip, Limitless, Extra Boost, Wildcard). Use this for questions like "compare best teams at different weights", "best team scenarios", "what if I change my ranking preference", or "should I play a chip". Returns { status, teamId, teamName, chip, scenarios: [{ ppm, ppmLabel, results: [{ chipKey, chipLabel, projectedPoints, expectedPriceChange, recommendation: null|"yellow"|"green" }] }] }. The recommendation level encodes the chip\'s lift over the no-chip baseline of the SAME ppm row, matching the Telegram /best_team_scenarios indicators.',
    parameters: z.object({
      teamId: z
        .string()
        .optional()
        .describe(
          'Canonical team identifier (preferred over teamName). Obtain via list_followed_teams or list_user_teams.',
        ),
      teamName: z
        .string()
        .optional()
        .describe(
          'Exact teamName. Used only when teamId is not provided.',
        ),
    }),
    execute: wrapToolExecute('get_best_team_scenarios', async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return computeBestTeamScenarios({
        chatId,
        teamId: args.teamId,
        teamName: args.teamName,
      });
    }),
  }),

  defineTool({
    name: 'list_followed_teams',
    description:
      'List the F1 Fantasy teams the user is tracking, enriched with the leagues each team appears in plus the team\'s current position in each league. Returns { status, teams: [{ teamId, teamName, leagues: [{ leagueCode, leagueName, position }], isSelected }] }. status="empty" means the user has not followed any league team yet. ALWAYS call this when the user asks "which teams do I track" or asks a multi-team question like "best teams for every team I track" — for the multi-team case, surface the team names back to the user and ask which one to focus on (one team per get_best_teams call).',
    parameters: z.object({}),
    execute: wrapToolExecute('list_followed_teams', async () => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return await listFollowedTeams({ chatId });
    }),
  }),

  defineTool({
    name: 'list_user_leagues',
    description:
      'List the private F1 Fantasy leagues the user has followed via /follow_league. Returns an array of { leagueCode, leagueName, registeredAt }. Use this when the user asks "which leagues do I follow" or when they name a league but you need to look up its `leagueCode` before calling `get_leaderboard`.',
    parameters: z.object({}),
    execute: wrapToolExecute('list_user_leagues', async () => {
      await ensureCacheReady();
      const chatId = getAgentChatId();
      const leagues = await listUserLeagues(chatId);

      return {
        leagues: (leagues || []).map((l) => ({
          leagueCode: l.leagueCode,
          leagueName: l.leagueName || l.leagueCode,
          registeredAt: l.registeredAt || null,
        })),
      };
    }),
  }),

  defineTool({
    name: 'get_leaderboard',
    description:
      'Get the standings (leaderboard) for one of the user\'s followed F1 Fantasy leagues. Pass the canonical `leagueCode` (e.g. "C7UYMMWIO07") — call `list_user_leagues` first if the user named a league by display name. Returns { status, leagueCode, leagueName, memberCount, fetchedAt, selectedTeamId, standings: [{ position, teamName, totalScore, gapToLeader, teamId, isSelected }] }. status="not_followed" means the user does not follow this league. status="not_found" means the league exists but the standings blob has not been generated yet.',
    parameters: z.object({
      leagueCode: z
        .string()
        .describe(
          'Canonical league code (e.g. "C7UYMMWIO07"). Look up via list_user_leagues if the user gave a display name.',
        ),
    }),
    execute: wrapToolExecute('get_leaderboard', async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return await getLeaderboard({ chatId, leagueCode: args.leagueCode });
    }),
  }),

  getLanguageTool,

  defineTool({
    name: 'get_next_race_info',
    description:
      'Get detailed information about the next upcoming F1 race: race name, circuit, location, weekend format (regular or sprint), session timestamps (qualifying / race, plus sprintQualifying / sprint on sprint weekends), historical race stats for that track, multi-language track history, circuit image URL, and an optional pre-fetched weather snapshot. Use for questions like "tell me about the next race", "what circuit is next", "give me race info", "what is the schedule for the next race", "track history", or "historical stats for this race". Returns { status, raceName, circuitName, circuitImageUrl, location, weekendFormat, isSprintWeekend, sessions, historicalRaceStats, trackHistory, weather }. status="unavailable" means the race-info cache has not been populated yet.',
    parameters: z.object({}),
    execute: wrapToolExecute('get_next_race_info', async () => {
      await ensureCacheReady();
      const chatId = getAgentChatId();
      const result = await getNextRaceInfo();
      const { lang } = await getFreshLanguagePreference(chatId);

      return {
        ...result,
        lang,
      };
    }),
  }),

  defineTool({
    name: 'get_race_weather',
    description:
      'Get the per-session hourly weather forecast (up to 3 hours per session, starting from each session start time, filtered to drop hours already in the past) for the next F1 race. Use for questions about weather, rain, temperature, wind, humidity, or cloud cover for the upcoming race weekend. Returns { status, raceName, circuitName, location, isSprintWeekend, sessions: [{ key, label, startsAt, hours: [iso], forecasts: [{ temperature, humidity, cloudCover, precipitation, precipitation_mm, wind }] }] }. status="unavailable" means either the race-info cache is empty or the weather API call failed.',
    parameters: z.object({}),
    execute: wrapToolExecute('get_race_weather', async () => {
      await ensureCacheReady();

      return await getRaceWeather();
    }),
  }),

  defineTool({
    name: 'get_deadline',
    description:
      'Get the next F1 Fantasy team-lock deadline. The deadline is the start time of the first locking session of the weekend: sprint (on sprint weekends) or qualifying (on regular weekends). Use for questions like "when does the team lock", "how long until the deadline", "next deadline", or "countdown to lock". Returns { status, raceName, sessionType, sessionLabel, sessionStartsAt: ISO, nowIso: ISO, alreadyStarted }. The web UI uses `sessionStartsAt` to render a live ticking countdown — return the result as-is and let the rich component handle the display.',
    parameters: z.object({}),
    execute: wrapToolExecute('get_deadline', async () => {
      // No cache needed — fetchNextRace pulls fresh from the schedule service.
      return await getDeadlineSnapshot();
    }),
  }),

  defineTool({
    name: 'get_current_team',
    description:
      "Get the user's CURRENT saved/selected F1 Fantasy roster — what they currently HAVE, not what they should have or what's best. Returns { status, teamId, teamName, chip, drivers, constructors, boostDriver, extraBoostDriver, freeTransfers, teamInfo: { totalPrice, costCapRemaining, overallBudget, teamExpectedPoints, teamPriceChange }, budgetChangePointsPerMillion, budgetAdjustedPoints }. status=`no_teams` means the user hasn't uploaded a team yet. status=`ambiguous_team` means they have multiple teams and no selection — surface the candidates and ask which team to focus on. status=`unknown_team` means the supplied teamId/teamName didn't match. status=`missing_cache` means drivers or constructors data is missing. NEVER call this when the user asks for projected/best/future/recommended/optimized teams — use `get_best_teams` or `get_best_team_scenarios` instead.",
    parameters: z.object({
      teamId: z
        .string()
        .optional()
        .describe(
          'Canonical team identifier returned by list_user_teams / list_followed_teams. Preferred over teamName.',
        ),
      teamName: z
        .string()
        .optional()
        .describe(
          'Exact teamName. Used only when teamId is not provided.',
        ),
    }),
    execute: wrapToolExecute('get_current_team', async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return await getCurrentTeam({
        chatId,
        teamId: args.teamId,
        teamName: args.teamName,
      });
    }),
  }),

  defineTool({
    name: 'list_league_teams',
    description:
      'List ALL teams in one of the user\'s followed leagues (the league\'s full roster, NOT just the teams the user tracks). Use this when you need to surface the picker for "which team in this league" before calling get_live_score_for_team. Returns { status, leagueCode, leagueName, matchdayId, teams: [{ teamId, teamName, userName, teamNo, position, isSelected }] } sorted by position ascending. `isSelected: true` marks the user\'s own team in this league. Statuses: ok / not_followed / not_found / invalid_input. Pass EITHER `leagueCode` OR `leagueName` (display name, case-insensitive substring match).',
    parameters: z.object({
      leagueCode: z.string().optional(),
      leagueName: z.string().optional(),
    }),
    execute: wrapToolExecute('list_league_teams', async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return await listLeagueTeams({
        chatId,
        leagueCode: args.leagueCode,
        leagueName: args.leagueName,
      });
    }),
  }),

  defineTool({
    name: 'get_live_score_for_team',
    description:
      'Get the live-score breakdown for ONE team in one of the user\'s followed leagues (per-driver / per-constructor points with captain/mega-captain multipliers, transfer penalty, and chip effects). **REQUIRES the user to have already chosen both a league AND a team** — do NOT call this tool until you have both. The clarify-and-focus pattern is: ask which league first, then ask which team in that league, then call this tool ONCE with leagueName + teamName. Pass EITHER `leagueCode` (canonical) OR `leagueName` (display name — the tool resolves it against the user\'s followed leagues). Identify the team via `teamId` (canonical, from list_followed_teams) or `teamName` (display name from the league\'s roster). Returns { status, leagueCode, leagueName, matchdayId, extractedAt, teamId, teamName, breakdown: { totalPoints, pointsBeforePenalty, transferPenalty, noNegativeApplied, totalPriceChange, driverBreakdown: [{ code, points, priceChange, details, isBoost, isExtraBoost, missing }], constructorBreakdown: [...], missingMembers } }. Statuses: ok / not_followed / not_found / team_not_found (includes `availableTeams` for asking the user) / invalid_input.',
    parameters: z.object({
      leagueCode: z
        .string()
        .optional()
        .describe(
          'Canonical league code. Provide this if you already have it; otherwise use leagueName.',
        ),
      leagueName: z
        .string()
        .optional()
        .describe(
          'League display name as the user typed it (case-insensitive substring match against the user\'s followed leagues).',
        ),
      teamId: z
        .string()
        .optional()
        .describe(
          'Canonical team identifier from list_followed_teams. Preferred over teamName.',
        ),
      teamName: z
        .string()
        .optional()
        .describe(
          'Team name as shown in the league\'s roster. Used only when teamId is not provided.',
        ),
    }),
    execute: wrapToolExecute('get_live_score_for_team', async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return await getLiveScoreForTeam({
        chatId,
        leagueCode: args.leagueCode,
        leagueName: args.leagueName,
        teamId: args.teamId,
        teamName: args.teamName,
      });
    }),
  }),

  defineTool({
    name: 'get_live_score_leaderboard',
    description:
      'Get the live-score leaderboard for ALL teams in one of the user\'s followed leagues, sorted by current live points (tie-break: total live price change). The user\'s own team row is marked with `isSelected: true` so the frontend can highlight it. Pass EITHER `leagueCode` (canonical) OR `leagueName` (display name — the tool resolves it against the user\'s followed leagues). Use for "compare live scores in [league]", "all teams live", "where do I rank live this race". Returns { status, leagueCode, leagueName, matchdayId, extractedAt, selectedTeamId, rows: [{ teamId, teamName, userName, teamNo, position, totalPoints, totalPriceChange, transferPenalty, isSelected }] }. Statuses: ok / not_followed / not_found / invalid_input. **Prefer passing `leagueName` directly** rather than calling list_user_leagues first — one tool call per question lands the rich UI render reliably.',
    parameters: z.object({
      leagueCode: z
        .string()
        .optional()
        .describe(
          'Canonical league code. Provide this if you already have it; otherwise use leagueName.',
        ),
      leagueName: z
        .string()
        .optional()
        .describe(
          'League display name as the user typed it. The tool resolves this against the user\'s followed leagues (case-insensitive substring match). Provide this when the user named a league by display name — DO NOT call list_user_leagues first.',
        ),
    }),
    execute: wrapToolExecute('get_live_score_leaderboard', async (args) => {
      await ensureCacheReady();
      const chatId = getAgentChatId();

      return await getLiveScoreLeaderboard({
        chatId,
        leagueCode: args.leagueCode,
        leagueName: args.leagueName,
      });
    }),
  }),

  // ---------------------------------------------------------------
  // Write tools (Phase 1+ — see src/agent/writeToolHelpers.js).
  //
  // Each write tool is registered via `defineWriteTool` in its own
  // module and pushed into `tools` from there. The generic commit
  // tool below consumes a server-issued writeNonce and executes the
  // staged intent. The LLM may only call it AFTER the user clicks
  // "Yes" on the <WriteConfirmCard> rendered in the chat stream.
  // ---------------------------------------------------------------
  setLanguageTool,

  defineTool({
    name: 'confirm_write',
    description:
      'Commit a previously-proposed write operation. The server rejects this call unless the authenticated user first clicked "Yes" on the confirmation card. The `writeNonce` MUST be the exact nonce echoed by the UI after that approval (single-use, expires in ~5 minutes). NEVER invent a nonce. NEVER call this in the same assistant turn as the propose call — wait for the user reply.',
    parameters: z.object({
      writeNonce: z
        .string()
        .min(1)
        .describe(
          'The exact writeNonce string returned by the prior write-tool call. Must come from the user\'s confirmation message.',
        ),
    }),
    execute: wrapToolExecute('confirm_write', async (args) => {
      const chatId = getAgentChatId();

      return await executeConfirmedWrite({
        chatId,
        writeNonce: args.writeNonce,
      });
    }),
  }),
];

module.exports = { tools };
