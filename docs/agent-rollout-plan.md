# Agent rollout plan — F1 Fantasy web-chat agent

This is the working plan for adding a **web-chat agent** as a second
user-facing surface for the Telegram bot, plus the cost-cap data fix
that fell out of Phase 2. It's structured so anyone can pick up where
we left off without prior context.

**Current state (2026-05-18):** Phases 1, 2, 3, 4, 5, plus the cost-cap
data-source fix, the api-data `prices.json` producer, and the bot's
`prices.json` consumer
([#183](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/183))
are all merged. **v1 capability scope is COMPLETE** — the agent
covers every read-only Telegram capability with a tailored React
render component: upcoming races, tracked teams + leagues +
leaderboards, best teams with filters, best-team scenarios
(ppm × chip matrix), next race info, weather forecast, lock deadline,
current saved roster, per-team live score breakdown, and all-teams
live leaderboard. **Phase 6 (polish & hardening) is COMPLETE.**
All five sub-phases are merged: Phase 6.1 — token-usage logging
([#188](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/188)),
Phase 6.2 — tool-error UX
([#189](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/189)),
Phase 6.3 — AGENTS.md refresh
([#190](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/190)),
Phase 6.4 — final regression sweep
([#192](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/192)),
and Phase 6.5 — chat history persistence
([#193](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/193)).
**Frontend deployment + CORS hardening (this PR)** wires up the
Azure resources (ARM templates under `infra/agent-{func,web}/`),
the npm `deploy:agent-*` commands, the six GitHub workflows, and the
env-var-driven CORS allowlist in `agentWebhook/index.js`. Once the
one-time bootstrap in `readme.md` → "Deploying the agent" is run,
push-to-main deploys to production and PRs deploy to the test slot
+ SWA preview environments automatically.

> Read [`AGENTS.md`](../AGENTS.md) → "Agent (Web Chat)" first if you're
> new to this codebase. That section is the authoritative reference for
> architecture, dev workflow, and the "add a new tool" checklist. This
> file is the roadmap that AGENTS.md slots into.

---

## Problem statement

Today the bot is reachable only via Telegram. We want a **second
channel**: a chat-style web app that talks to an LLM agent that runs the
same underlying logic as the Telegram bot, plus richer post-processing
(filtering best-teams by must-include/must-exclude drivers, alternative
rankings, filtering races by country, cross-league queries…).

The Telegram bot **must keep working at every step**. We refuse to ship
a phase that risks Telegram regressions. Each existing handler is being
refactored into `(pure core in src/cores/) + (thin Telegram adapter)`,
with the new core shared between the Telegram path and the agent tool.

## Locked decisions (recap)

| Decision           | Value                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel            | Web chat — **Vite + React + CopilotKit** frontend                                                                                                                                            |
| Frontend UX        | CopilotKit `<CopilotChat />` + `useCopilotAction({ render })` per tool                                                                                                                       |
| LLM runtime        | **CopilotKit v2 `BuiltInAgent`** wraps Zod-typed `defineTool` entries; runs them via Vercel AI SDK `streamText` internally. Model built from **`@ai-sdk/azure`** (`azure.chat(deployment)`). |
| Tool param schemas | **Zod** (Standard Schema V1) via `defineTool({ parameters: z.object({…}), execute })`                                                                                                        |
| Backend hosting    | **Separate Azure Function App** for the agent (independent deploy/scale/failure from the Telegram bot)                                                                                       |
| Identity (v1)      | Hardcoded chatId via `AGENT_HARDCODED_CHAT_ID` env var                                                                                                                                       |
| Telegram isolation | Cores are shared — Telegram surface stays byte-identical                                                                                                                                     |
| Language v1        | English-only                                                                                                                                                                                 |

See `AGENTS.md` → "Agent (Web Chat)" → "Why this stack" for the full
rationale, including the gotchas we hit (CopilotKit v2 silently ignores
bare `actions:`, Azure OpenAI URL shape, parallel-tool-calls breaking
the React rendering, etc.).

## Phasing principles

Each phase ends with:

1. **Telegram bot fully working** — `npm test` green, no behaviour changes.
2. **Web app working** with all capabilities from previous phases **plus**
   one new capability slice.
3. **A clear acceptance test** the user can run before approving the next phase.

If a phase breaks (1) or (2), we stop and fix before moving on.

---

## Phase 1 — Thin vertical slice (foundation + first tool + first rich component) — ✅ MERGED (PR #180, commit `cb5fbe1`)

**Goal:** prove the entire pipeline end-to-end with the simplest
possible capability — "what are the next races?" → rich `<NextRacesTable />`.

**What shipped:**

- `agentWebhook/` — Azure Functions v3 ↔ Web Request bridge with permissive dev CORS, tolerant of both `Uint8Array` and string body chunks.
- `src/agent/{identity,systemPrompt,tools,runtime}.js` — `BuiltInAgent` + `CopilotRuntime` + `createCopilotRuntimeHandler({ mode: 'single-route' })`.
- `src/cores/nextRacesCore.js` — first pure core (template shape for every future core).
- `src/commandsHandler/nextRacesHandler.js` — refactored to thin adapter. 711/711 tests stayed green.
- `web/` — Vite + React + TS frontend with `<CopilotKit>` + `<CopilotChat>`.
- `web/src/components/NextRacesTable.tsx` — pattern for every future render component.
- `scripts/dev-agent-server.js` — local Node HTTP wrapper around the same handler the function uses; no `func` CLI required.
- `npm run dev` / `dev:agent` / `dev:web` via `concurrently`.

**Remaining Phase-1 todo:** `p1-frontend-deploy` — ✅ **DONE** (this
PR). Provisioned via `infra/agent-func/azuredeploy.json` (Function App
+ `test` slot + KV role assignments) and
`infra/agent-web/azuredeploy.json` (Static Web App). Six GitHub
workflows wire up infra deploys (push-to-main on `infra/agent-*/**`
changes) and code deploys (push-to-main → prod, PR → test slot / SWA
preview). See `readme.md` → "Deploying the agent" for the one-time
bootstrap (KV secret + first-pass ARM deploy + SWA token paste).

---

## Phase 2 — Best teams + filtering (the headline feature) — ✅ MERGED (PR #181, commit `983c714`)

**Goal:** the marquee user request works:
_"Best teams for kilzid3 with Verstappen but no Alonso."_
Result renders as a rich `<BestTeamsTable />` with each team's roster,
captain, projected points, and filter highlights.

**PR:** [#181](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/181)
(merged 2026-05-16 as commit `983c714`).
**Status:** ✅ **MERGED to `main`.** 754/754 tests passed, lint clean,
Playwright-verified end-to-end before merge. Shipped together with the
companion cost-cap fix in
[f1-fantasy-api-data#19](https://github.com/F1-fantazy-bot/f1-fantasy-api-data/pull/19).

**What shipped:**

1. ✅ `src/bestTeamsCalculator.js` — optional 5th `options` arg with `mustInclude{Drivers,Constructors}` / `mustExclude{Drivers,Constructors}` filters (applied BEFORE the top-K slice so candidates outside the legacy top-K don't get lost), `rankBy: null | 'points' | 'budget_adjusted'`, and `resultCount`. Empty/absent options preserve legacy 4-arg behaviour **byte-for-byte** — the existing 11 `bestTeamsHandler.test.js` cases pass unchanged because the refactored Telegram handler calls the calculator with the historical 4 positional args. (The value-for-money `'points_per_million'` option introduced briefly in Phase 3 was removed — in this bot, "points per million" is the per-team budget-adjusted weight set via `/set_best_team_ranking`, not a value-for-money sort.)
2. ✅ `src/cores/bestTeamsCore.js` — `computeBestTeams({chatId, teamId?, teamName?, rankBy?, mustInclude*, mustExclude*})` with status-tagged result: `no_teams | unknown_team | ambiguous_team | missing_cache | missing_remaining_race_count | unknown_filter | ok`. Driver / constructor codes normalised through `NAME_TO_CODE_MAPPING` (the LLM can pass `'VER'` or `'m. verstappen'` interchangeably). Unresolved names surface as `unknown_filter` so the LLM can ask for clarification — no silent drops.
3. ✅ `src/cores/userTeamsCore.js` — `listUserTeams({chatId})` returns `[{teamId, teamName, isLeague, isSelected, chip, drivers, constructors, boost, freeTransfers, costCapRemaining}]`.
4. ✅ `src/commandsHandler/bestTeamsHandler.js` — refactored to thin adapter. `validateJsonData` is now properly `await`ed (was previously a Promise being `!`'d — silent latent bug). All 11 existing handler tests pass byte-for-byte unchanged.
5. ✅ `src/agent/cacheBootstrap.js` — `ensureCacheReady()` lazily runs `initializeCaches(noopBot)` once per agent process. Resets on failure for retry-on-next-call. The agent runs in a separate process from the Telegram bot so it needs to populate `currentTeamCache`/`driversCache`/etc. before tools that read them can run. The noop bot is `{ sendMessage: async () => undefined }` — the log-side-effect calls in `initializeCaches` become no-ops since the agent process has no Telegram token.
6. ✅ `src/agent/tools.js` — adds `list_user_teams` (no args) and `get_best_teams` (`{teamId?, teamName?, rankBy?, mustInclude*, mustExclude*}`). Both `await ensureCacheReady()` first. `get_best_teams` returns a compact DTO (~10 teams × ~10 numeric fields) — kept small so the streamed tool payload doesn't bloat.
7. ✅ `src/agent/systemPrompt.js` — workflow rules teaching the LLM to call `get_best_teams` DIRECTLY with `teamName` (avoids the multi-tool-call rendering limitation — see #5 in the gotchas table).
8. ✅ `src/agent/runtime.js` — `providerOptions: { openai: { parallelToolCalls: false } }` on the `BuiltInAgent`. Without this Azure OpenAI emits parallel tool calls in one assistant message; CopilotKit's `useLazyToolRenderer` only renders `toolCalls[0]` (see `node_modules/@copilotkit/react-core/src/hooks/use-lazy-tool-renderer.tsx:15`). Forcing sequential calls makes each tool's React render component mount correctly.
9. ✅ `web/src/components/BestTeamsTable.tsx` — top-10 table; captain ⭐, mega-captain ⭐⭐, must-include drivers highlighted green, penalty markers, conditional budget-adjusted / points-per-million columns.
10. ✅ `web/src/components/UserTeamsList.tsx` — responsive card grid; ACTIVE badge for the selected team, chip pill, league/screenshot tag.
11. ✅ `web/src/App.tsx` wires both new actions alongside the Phase 1 `useNextRacesAction`.
12. ✅ +32 new tests (711 → 743 → 754 with the mapper unit-test suite added for the cost-cap fix).

**Acceptance test for Phase 2 (PASSED):**

- Web app: _"Best teams for Kilzid 3 with Verstappen but no Alonso."_ → `<BestTeamsTable />` shows 10 teams, every row has VER, none has ALO, captain ⭐ on LEC.
- Web app: _"What teams am I tracking?"_ → `<UserTeamsList />` shows 5 cards (Kilzid2 marked ACTIVE).
- Web app: _"Next races in Italy?"_ (Phase 1) → still works.
- Telegram `/best_teams` → identical to pre-refactor (all 11 existing tests pass byte-for-byte).
- `npm test` → 754/754 green.

### Phase 2 companion: cost-cap data fix — ✅ MERGED (f1-fantasy-api-data#19, commit `79c504e`)

The new `<UserTeamsList />` UI surfaced a pre-existing bug: every league
team showed `costCapRemaining: 0`. Root cause: `teams-data.json#budget`
was `team_info.teamVal` (the team's current value, i.e. sum of roster
prices) rather than the user's cost cap, so the bot's
`mapLeagueTeamToBotTeam` formula `budget − Σ_prices` always yielded 0.

We considered three approaches and landed on **fix at the data source**:

1. ~~Bot-only: extra blob fetch + workaround logic.~~ Rejected — wrong layer.
2. ~~Bot-only with additive `maxTeambal` field on the scraper.~~ Rejected after consumer audit: nothing semantically depends on the old `budget = teamVal` (only one informational `console.log` line in the scraper itself + the bot's mapper). Carrying two fields where one will do adds noise.
3. **✅ Rename `budget` to mean the cap.** The scraper now writes `team_info.maxTeambal` as `budget` on each team row in `teams-data.json` (and locked snapshots). The old semantic is retired.

**Scraper PR — [f1-fantasy-api-data#19](https://github.com/F1-fantazy-bot/f1-fantasy-api-data/pull/19)** (merged as commit `79c504e`): 3 commits — 2 prettier-reformat + 1 functional (`feat: redefine teams-data.json#budget as the user's cost cap`).

- `src/budget.js`: `extractStartBudget` deleted; `extractBudget` returns `maxTeambal`.
- `src/fetchLeagueData.js`: single `budget` variable carries the cap. Reused for both `teamsComposition` row and `raceBudgets[matchday_N]` entry.
- `src/fetchLockedLeagueData.js`: call site unchanged; helper just returns the right thing.
- `AGENTS.md` redefined.

**Bot PR — [f1-fantazy-bot#181](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/181)**: the mapper now reads `leagueTeam.budget` as the cap unconditionally (one `Number(leagueTeam.budget)` read). No additive field, no shim.

**Transition window (now closed):** between scraper merge and the next scrape, stale blobs carried `budget = teamVal`. The mapper computed `teamVal − Σ_prices ≈ 0` — exactly the value the bot reported in production before the fix, so no regression at any point. Once the post-merge scrape repopulated the blobs, all teams started showing correct cap-remaining.

**Live verification (post-merge, against fresh blobs in Azure):**

| Team      | budget written | cap remaining (UI) | F1 Fantasy site |
| --------- | -------------- | ------------------ | --------------- |
| Kilzid    | 109.2          | **2.4**            | 2.4 ✓           |
| Kilzid2   | 110.8          | **1.4**            | 1.4 ✓           |
| Kilzid 3  | 112.8          | **0.0**            | 0 ✓             |
| dorsegal1 | 110.4          | **1.3**            | 1.3 ✓           |
| Cooperon  | 111.6          | **0.9**            | 0.9 ✓           |

All five exact-match the F1 Fantasy site.

---

## Phase 3 — Cross-league / followed teams ✅ **MERGED (PR #184, squash commit `508b681`)**

Squash-merged `2026-05-17` as commit `508b681`.

**Goal:** the second user request works:
_"Best teams by points-per-million for every team I track."_
**Updated approach (2026-05-17):** the agent does NOT fan out. It calls
`list_followed_teams`, asks the user which specific team to focus on,
then runs `get_best_teams` for that one team. Single rich render per
question. This sidesteps the `parallelToolCalls: false` rendering
constraint cleanly without a server-side batch tool.

**Telegram surface changes:** none. The handler refactor was
**deferred** — `leaderboardHandler.js` is already a thin
`getLeagueData → formatLeaderboard → sendMessage` pipeline, and
`formatLeaderboard` is tested directly with the raw blob shape (the
byte-identical rule). The new `leaderboardCore` is an **additive**
abstraction for the agent that returns enriched standings
(`selectedTeamId`, `gapToLeader`, `isSelected`).

**What shipped on the branch:**

- `src/cores/followedTeamsCore.js` — `listFollowedTeams({chatId})`
  returns status-tagged result with teams deduplicated by `teamId`
  across all followed leagues, each entry carrying its
  `leagues: [{leagueCode, leagueName, position}]` enrichment.
- `src/cores/leaderboardCore.js` — `getLeaderboard({chatId, leagueCode})`
  returns status-tagged result (`ok` / `not_followed` / `not_found` /
  `invalid_input`) with sorted standings + `selectedTeamId` for
  client-side highlighting.
- Tests for both cores in `src/cores/*.test.js` (10 new tests,
  Jest stays at 770/770).
- 3 new agent tools in `src/agent/tools.js`:
  `list_followed_teams`, `list_user_leagues`, `get_leaderboard`. Plus
  `get_best_team_scenarios` (a 4th tool added in the same phase) —
  returns the 4×4 ppm-preset × chip matrix from
  `src/cores/bestTeamScenariosCore.js`, mirroring the Telegram
  `/best_team_scenarios` command. Used by the LLM for "compare best
  teams at different weights", "best team scenarios", and "what if I
  change my ranking preference" questions.
- `src/cores/bestTeamScenariosCore.js` + tests — pure 4×4 matrix
  computation. Returns status-tagged result with one section per ppm
  (0 / 1.3 / 1.65 / 2.0) and per-section results for the 4 chip
  scenarios (no chip / Limitless / Extra Boost / Wildcard). Each cell
  carries `projectedPoints`, `expectedPriceChange`, and a
  `recommendation` (`null` / `'yellow'` / `'green'`) computed against
  the no-chip baseline of the SAME ppm row, matching the chip-specific
  thresholds in `getChipRecommendationDot`.
- `src/agent/systemPrompt.js` — clarify-and-focus rule for multi-team
  questions, plus "points per million" guidance: when a user asks for
  "best teams by points per million", call `get_best_teams` with
  `rankBy='budget_adjusted'` (NOT a value-for-money calc).
- `web/src/components/FollowedTeamsGrid.tsx` — card-per-team grid with
  `leagueName: position` chips, ACTIVE highlight on the user's
  selected team.
- `web/src/components/LeaderboardTable.tsx` — standings table with
  the user's row highlighted, status-driven fallbacks for
  not_followed / not_found.
- `web/src/components/BestTeamScenariosMatrix.tsx` — 4 ppm sections ×
  4 chip rows showing projected points, Δ expected price change, and
  🟢/🟡 chip recommendation dots mirroring the Telegram
  `/best_team_scenarios` display.
- `web/src/App.tsx` — registers the 3 new render hooks.

**Acceptance test:**

- Web app: _"Best teams by points-per-million for every team I track."_
  → agent shows `<FollowedTeamsGrid />` and asks _"which team to focus
  on?"_ → user replies _"Kilzid2"_ → ONE `<BestTeamsTable />` renders.
- Web app: _"Show me the leaderboard for kilzi test."_ → `list_user_leagues`
  resolves the code → `<LeaderboardTable />` with the user's row bolded.
- Web app: _"Which leagues do I follow?"_ → list.
- Phase 1+2 questions still work.
- Telegram: `/leaderboard`, `/teams_tracker` → byte-identical.
- `npm test` → 770/770 green.

---

## Phase 4 — Race info, weather, deadline ✅ **MERGED (PR #185, squash commit `c14dc97`)**

Squash-merged `2026-05-17` as commit `c14dc97`.

**Goal:** the agent can answer all "next race" questions in detail
(weather, schedule, lock deadline, full race info) — each rendered
with a tailored component.

**Tasks:**

1. ✅ Extract cores:
   - `src/cores/nextRaceInfoCore.js` from `nextRaceInfoHandler.js` — opportunistic weather cache with `onFetch`/`onError` hooks so the Telegram adapter keeps its `sendLogMessage`/`sendErrorMessage` calls (existing handler test stays byte-identical green).
   - `src/cores/raceWeatherCore.js` from `nextRaceWeatherHandler.js` — `now` injection makes the `nowRounded` 3-hour filter testable.
   - `src/cores/deadlineCore.js` — **additive**. `deadlineHandler.js` is intentionally untouched (its tests import `formatDuration`/`getDeadlineSession`/`buildDeadlineMessage`/`getDeadlinePayload` directly, so the safest extraction was a new agent-facing `getDeadlineSnapshot` that reuses `fetchNextRace` + `getDeadlineSession`).
2. ✅ Handlers refactored to thin adapters:
   - `nextRaceInfoHandler.js` 254 → 209 lines, 9/9 tests pass unchanged.
   - `nextRaceWeatherHandler.js` 130 → 65 lines, 3/3 tests pass unchanged.
3. ✅ Three agent tools in `src/agent/tools.js` (all no-arg, `parameters: z.object({})`):
   - `get_next_race_info`.
   - `get_race_weather`.
   - `get_deadline`.
4. ✅ Rich components:
   - `web/src/components/RaceInfoCard.tsx` — circuit image, schedule (quali/race + sprint pair when applicable), weather chips, historical results table, track history. **FP1/FP2/FP3 deferred** — `nextRaceInfoCache` doesn't track practice sessions; render only the sessions present in cache.
   - `web/src/components/WeatherForecast.tsx` — per-session cards with up to 3 hourly forecast chips (temp, rain %/mm, wind, humidity, cloud cover, weather emoji).
   - `web/src/components/DeadlineCountdown.tsx` — live ticking countdown anchored to the server clock via `nowIso` skew compensation; stops ticking once deadline passes; cleans up interval on unmount.
   - All registered in `web/src/App.tsx`.
5. ✅ +17 new tests (775 → 792 total).

**System prompt addition:** race-info / weather / deadline routing block placed AFTER the scenarios-precedence and team-name rules, with an explicit exclusion clause — "best team for the next race" still routes to `get_best_teams`, not `get_next_race_info`.

**Companion fix bundled into the PR:** `eslint.config.mjs` added an `ignores` entry for `web/dist` + `web/node_modules` + `node_modules` + `coverage` — ESLint flat config doesn't auto-read `.eslintignore`, and the new `cd web && npm run build` verification step was tripping the pre-commit hook on bundled syntax.

**Acceptance test:** ✅ all passed in Playwright

- Web app: _"What's the weather forecast for the next race?"_ → renders `<WeatherForecast />` (4 sessions × 3 hourly cards) ✅
- Web app: _"How long until the next deadline?"_ → renders `<DeadlineCountdown />` with a live ticking clock (verified 24:20 → 23:45 in ~3s) ✅
- Web app: _"Tell me about the next race."_ → renders `<RaceInfoCard />` ✅
- Phase 1–3 regression: _"best teams for Doron-Kilzi_3"_ → `<BestTeamsTable />` ✅
- Telegram: handler tests stay byte-identical (9/9, 3/3, 12/12) ✅
- `npm test` → 792/792 green ✅

---

## Phase 5 — Current team + live score ✅ **MERGED (PR #187)**

Merged via PR [#187](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/187) — **v1 capability scope is now COMPLETE**.

**Goal:** complete the v1 capability scope. After this phase the agent
covers every read-only thing the Telegram bot can do, each with a
tailored component.

**Tasks:**

1. ✅ Extract cores:
   - `src/cores/currentTeamCore.js` from `currentTeamInfoHandler.js` — status-tagged (`ok` / `no_teams` / `unknown_team` / `ambiguous_team` / `missing_cache`); team resolution mirrors `bestTeamsCore.pickTeamId` exactly.
   - `src/cores/liveScoreCore.js` from `liveScoreHandler.js` — three entry points (`getLiveScoreForTeam`, `getLiveScoreLeaderboard`, `listLeagueTeams`); all validate `leagueCode` / `leagueName` against `listUserLeagues(chatId)` before fetching (prevents arbitrary-blob access).
   - **Companion utils extraction** (per rubber-duck — cleaner than core importing handler): `src/utils/liveScoreCalc.js` — `mapLockedTeamForScoring`, `calculateLiveScoreBreakdown`, `deriveLiveScoreOptions` moved out of `liveScoreHandler.js`. Handler re-exports them for back-compat with its 735-line test (which stays green unchanged).
2. ✅ Handlers refactored to thin adapters:
   - `currentTeamInfoHandler.js` — 69 → 57 lines. Test 7/7 pass unchanged.
   - `liveScoreHandler.js` — 635 → 506 lines (only helper-import move + unused `mapNameToCode` import removed). Test 40/40 pass unchanged.
3. ✅ **Four** new agent tools (the original spec had two; split during rubber-duck for cleaner UX):
   - `get_current_team` (args: optional `teamId` / `teamName`).
   - `list_league_teams` (args: `leagueCode` OR `leagueName`) — returns the FULL roster of a followed league with `isSelected: true` on the user's own team. The system prompt uses this (not `list_followed_teams`) to ask which team to focus on, so the user can pick ANY team in the league just like Telegram `/live_score`.
   - `get_live_score_for_team` (args: `leagueCode` OR `leagueName`, plus optional `teamId` / `teamName`) — accepts both league forms so the LLM doesn't need to chain `list_user_leagues` first (avoids the `useLazyToolRenderer` multi-step quirk). Has a `teamId` → `teamName` fallback in `pickLockedTeam`.
   - `get_live_score_leaderboard` (args: `leagueCode` OR `leagueName`) — all-teams view, sorted by live points desc.
4. ✅ Rich components:
   - `web/src/components/CurrentTeamCard.tsx` — team header with chip badge, drivers/constructors chips (boost ⭐, mega-captain 🏆), metrics grid (total price, cost cap remaining, overall budget, expected points, budget-adjusted when ppm preset > 0, expected price change, free transfers).
   - `web/src/components/LiveScoreBreakdown.tsx` — header with league/matchday/team, big total live points (with pre-penalty if applicable), Δ price change, active-chip badges (🛡️ No Negative), per-driver and per-constructor cards with effective points × multiplier badge (x2 / x3) + session breakdowns.
   - `web/src/components/LiveScoreLeaderboard.tsx` — sortable table (rank, team, live pts, Δ price), user row highlighted with `YOU` badge, `†` marker on penalty rows.
   - All wired in `web/src/App.tsx`.
5. ✅ +53 new tests (775 → 828 total).

**System prompt — strengthened clarify-and-focus pattern (per user testing feedback):**

For live-score questions:
1. Ask which league (if user follows >1).
2. Call `list_league_teams` (NOT `list_followed_teams`) to surface the league's FULL roster. The user can pick ANY team in the league, not just their own tracked teams. Mirrors Telegram `/live_score` behavior.
3. Then call `get_live_score_for_team` ONCE with both `leagueName` + `teamName` so the rich UI render lands reliably.

Strengthened exclusion clause: questions about _projected_, _best_, _future_, _optimized_, or _recommended_ teams stay with `get_best_teams` / `get_best_team_scenarios`, even when phrased as "current race" or "next race".

**Acceptance test:** ✅ all passed in Playwright (fresh browser sessions per prompt)

- Web app: _"Show me my current team"_ → renders `<CurrentTeamCard />` (Kilzid2: drivers/constructors chips, total price 109.40$M, 275.40 expected pts) ✅
- Web app: _"What's my live score this race?"_ → 3-step clarify-and-focus chain (ask league → "kilzi test" → list all 8 league teams → "HIRSCHEL" → `<LiveScoreBreakdown />` rendered with 142.00 pts — proves any team in the league can be picked, not just the user's own) ✅
- Web app: _"Show me the live-score leaderboard"_ → ask league → "kilzi test" → `<LiveScoreLeaderboard />` rendered as sorted table (233 → 95 pts, Δ price column visible) ✅
- Phase 1–4 regression (_"How long until the next deadline?"_) → `<DeadlineCountdown />` ticking ✅
- Telegram: `/current_team_info`, `/live_score` byte-identical (handler tests 7/7 + 40/40 unchanged) ✅
- `npm test` → 828/828 green ✅

---

## Phase 6 — Polish & hardening

**Goal:** make this maintainable in production. No new capabilities.
Shipped as a series of small, incremental PRs (easier to review, easier
to revert) rather than one big "Phase 6" PR.

### Phase 6.1 — Token usage logging ✅ MERGED ([#188](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/188))

Per-step LLM `prompt / completion / total` tokens logged to the existing
`LOG_CHANNEL_ID` via `sendLogMessage` so we can monitor agent cost the
same way the Telegram `/ask` command already does.

**What landed:**

- `src/agent/tokenUsageMiddleware.js` — a `LanguageModelV3Middleware`
  attached via `wrapLanguageModel` from `ai`. Observes the raw stream
  coming back from Azure and emits a log line for every `finish` chunk
  it sees. Per-step (not per-turn) because that's the granularity the
  underlying API exposes — a single agent turn with N tool calls
  produces up to N+1 finish chunks.
- `src/agent/notifierBot.js` — singleton **non-polling** `TelegramBot`
  for the agent process, so it can `sendMessage` to the same log
  channels the main bot uses without conflicting with the main bot's
  long-polling loop. Falls back to a noop when `TELEGRAM_BOT_TOKEN` is
  unset.
- `src/agent/cacheBootstrap.js` — switched from an inline `getNoopBot()`
  to the shared notifier so cache-init logs also land in Telegram.
- `ai` is now an explicit dependency (was transitive via
  `@copilotkit/runtime`).

**Gotcha:** the V3 usage shape is **nested** (`usage.inputTokens.total`
/ `usage.outputTokens.total`), not the flat V2 shape (`promptTokens` /
`completionTokens`). There is no aggregated `totalTokens` in V3 — we
compute it locally. Logging is fire-and-forget with sync + async catch
guards so a Telegram outage cannot break the LLM stream piping back to
the browser.

**Log format:**

```
BOT: Agent step usage — model: gpt-4o, step: 1, prompt: 120, completion: 30, total: 150
env: prod
pid: 12345
```

### Phase 6.2 — Error UX ✅ MERGED ([#189](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/189))

When a tool throws or the LLM fails, the web chat renders a friendly
red banner instead of leaking a raw Azure error string to the user.

**What landed:**

- `src/agent/wrapToolExecute.js` — `wrapToolExecute(name, fn)` returns
  `{ status: 'tool_error', tool, errorId, userMessage }` on throw.
  The 8-char `errorId` (slice of `randomUUID()`) is the user-visible
  correlation token. **Never** leaks raw `err.message` to the UI —
  Azure errors routinely include URLs, container names, request IDs,
  and SAS tokens.
- Full technical error (including stack) is pushed to
  `ERRORS_CHANNEL_ID` via `sendErrorMessage(notifierBot, …)` — the
  same notifier introduced in Phase 6.1. The notifier-send is itself
  try/catched so a Telegram outage cannot break the tool dispatch
  path.
- All **14** tools in `src/agent/tools.js` are wrapped via this
  helper. Two tools without rich UI (`list_user_leagues`,
  `list_league_teams`) still benefit — their `tool_error` result is
  narrated by the LLM via the new system-prompt rule.
- `web/src/components/ToolErrorFallback.tsx` — shared red-banner
  component + `isToolErrorResult()` type-guard. All 12 render hooks
  short-circuit on `tool_error` with a uniform three-line addition.
- `src/agent/systemPrompt.js` gained a "Tool error handling" section:
  surface `userMessage`, suggest retry, **DO NOT** retry the same
  tool with the same args, **DO NOT** invent data, **DO NOT** expose
  `errorId` unless asked.

**Tests:** 12 new tests in `wrapToolExecute.test.js` cover the
discriminator, success passthrough (3 cases), async + sync + non-Error
throws, full-error routing to the channel with matching `errorId`,
**secret-leak regression guard** (asserts SAS tokens / URLs / sig
params cannot reach the returned UI shape), notifier-failure
resilience, and `errorId` uniqueness across 50 calls.

**Format:**
- UI banner: _"⚠️ Something went wrong — Please try again in a moment."_
- Collapsed `<details>` block with `tool` + `errorId` for support.
- Channel log: `Agent tool "<name>" threw [<errorId>]: <err.message>\n<stack>`.

### Phase 6.3 — Docs refresh ✅ MERGED ([#190](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/190))

Doc-only refresh of `AGENTS.md` so future contributors can pick up the
work without re-deriving the Phase 6 patterns from the merged PRs.

**What landed:**

- New "Token usage logging (Phase 6.1)" and "Tool error handling
  (Phase 6.2)" sections in `AGENTS.md` with flow diagrams, the V3
  nested-usage-shape gotcha (`usage.inputTokens.total` /
  `outputTokens.total`, NOT V2 flat), the per-step granularity caveat,
  and the secret-redaction policy with explicit _"do not weaken this
  test"_ wording for the regression guard.
- New "Environment variables" table documenting required Azure creds
  + optional `TELEGRAM_BOT_TOKEN` / `LOG_CHANNEL_ID` /
  `ERRORS_CHANNEL_ID` (gracefully degrade to stdout-only when unset).
- New pitfall callouts captured from Phase 5: `useLazyToolRenderer`
  + clarify-and-focus pattern for two-arg lookups, `liveScoreCore`
  cross-league lesson (don't auto-default to `selectedTeam`),
  unescaped-backtick gotcha in the system-prompt template literal.
- Updated "Adding a new tool" checklist: step 3 mandates
  `wrapToolExecute`, step 5 mandates the `<ToolErrorFallback />`
  short-circuit — both with exact paste-able snippets.
- Code-layout tree + Key files table updated for `notifierBot.js`,
  `tokenUsageMiddleware.js`, `wrapToolExecute.js`,
  `ToolErrorFallback.tsx`. One stale duplicate "Identity model (v1)"
  heading removed.

### Phase 6.4 — Regression sweep ✅ MERGED ([#192](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/192))

Final v1 verification before history-persistence ships. Confirmed
that nothing in Phases 6.1 / 6.2 / 6.3 broke an existing capability.

**Automated gates (run 2026-05-18):**

| Gate | Result |
|---|---|
| `npm test` | **850/850** passing across 82 suites |
| `cd web && npm run build` | clean (✓ built in ~10s) |
| `npm run lint` | 4 pre-existing warnings, **0 errors** in modified files |
| Runtime smoke (`require('./src/agent/runtime').getCopilotRuntimeHandler()`) | All **14 wrapped tools** load; handler builds; notifier bot falls back to noop when `TELEGRAM_BOT_TOKEN` unset, as expected |

**Why this is enough for v1:**

- The risky surfaces (Phase 6.1 streaming middleware, Phase 6.2
  error-UX wrapper on 14 tools + 12 components) each ran a
  per-PR Playwright gate BEFORE merging.
- Phase 6.3 was doc-only — no behaviour change.
- The unit suite at 850/850 covers the wrapper (12 tests including
  the secret-leak regression guard) and the middleware (10 tests
  including telegram-failure resilience).
- The TypeScript build catches any prop-shape drift across the 12
  fallback-wrapped React components.

**Deferred (with user-runnable checklists in this section's history
on GitHub PR):**

- Full Playwright smoke on the agent (12 prompts, one per UI-rendered
  tool). The checklist exists; run it before any deployment cut.
- Telegram top-10 read-only commands smoke. Same — the cores were
  refactored additively, the Telegram adapters were not touched in
  Phase 6, so behaviour drift is highly unlikely but worth a final
  manual confirmation before deployment.

### Phase 6.5 — History persistence ✅ MERGED ([#193](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/193))

Final v1 polish slice. After a page reload, the last 20 user-or-
assistant **text** messages reappear in the chat — but no tool
calls, tool results, or large blobs (`availableTeams`, leaderboard
rows, live-score payloads) are persisted. Reloads cannot
re-introduce stale data into the LLM context.

**What landed:**

- `web/src/lib/chatHistoryStore.ts` — schema-versioned localStorage
  payload `{ version: 1, savedAt, messages: StoredMessage[] }` with
  strict per-item validation, dedupe-on-load, double caps (20
  messages **or** 100 KB total — whichever hits first), and
  whole-payload-reject on any corruption / version mismatch / per-
  field failure. Quota errors and read errors both swallowed with
  a `clear()` fallback. Exports `load`, `save`, `clear`,
  `toStoredMessages` (AG-UI → persistence shape), and
  `toAgUiMessages` (persistence → AG-UI). Strict allowlist when
  flattening `ContentBlock[]` content — only `type === 'text'`
  blocks survive.
- `web/src/components/HistoryRestorer.tsx` — uses
  `useAgent({ agentId: 'default', updates: [OnMessagesChanged,
  OnRunStatusChanged] })`. Tracks restoration per-agent-instance
  via `restoredAgentRef.current === agent` (handles the stub →
  real swap). Gates the save effect on a `hydrated` state flag
  that flips on a `queueMicrotask` after restore, so the very first
  `OnMessagesChanged` from the restored array can't trigger an
  empty-save race. Auto-save is debounced 500 ms AND gated on
  `agent.isRunning === false` — `OnRunStatusChanged` guarantees we
  re-trigger when a stream completes, so reloading mid-stream
  cannot persist a half-formed assistant reply. Uses a cheap
  fingerprint (`length:lastId:lastContentLen`) as the React dep so
  in-place message-array mutations still fire the effect.
- `web/src/components/ClearHistoryButton.tsx` — small button next
  to the header; on click `clear()` + `agent?.setMessages([])`.
- `web/src/App.tsx` — single `<CopilotKit>` provider wrapping the
  whole header + chat (so all three hooks share the same agent
  instance); `<HistoryRestorer />` mounted inside.

**API correction worth flagging:** The earlier rubber-duck pass
assumed `useCopilotMessagesContext()` was the right hook. It does
**NOT** exist in the installed CopilotKit version. The real hooks
live at `@copilotkit/react-core/v2` (subpath import — `useAgent`,
`UseAgentUpdate` are **not** in the root). Future contributors:
always check `node_modules/@copilotkit/react-core/dist/v2/...d.cts`
when looking for the v2 hooks, not the root index typedef.

**Rubber-duck-vetted (second pass):** This phase went through a
second rubber-duck critique that surfaced three blockers — restore
overwritten by an early empty save, agent stub→real swap losing
restoration, and mid-stream partial saves persisting half-formed
replies — plus six important findings. All addressed in the
shipped code; design rationale captured inline in
`HistoryRestorer.tsx`.

**Deferred (run before any deployment cut):**

- Manual reload-after-conversation smoke. Boot the dev frontend
  (`npm run dev`), run a 3-turn conversation that includes at
  least ONE tool call, reload the page. Expect: (a) the 3 user
  messages + 3 assistant text replies appear in order, (b) the
  rich tool-render component does NOT reappear (intentional —
  tool blobs are stripped on persist), (c) the localStorage
  `f1-fantasy-agent-history` key is well-formed JSON with
  `version: 1`, (d) reloading mid-stream does NOT persist a
  half-formed assistant reply (the `isRunning` gate prevents it),
  (e) the "Clear chat history" button empties both the chat and
  the storage. The TypeScript build + the rubber-duck-vetted race
  mitigations cover the code paths; this smoke confirms the
  UX end-to-end on real Azure traffic.

### Resolved (frontend deployment PR)

- **CORS hardening**: ✅ resolved by `src/agent/corsAllowList.js` +
  env-var-driven matcher in `agentWebhook/index.js`. Prod slot
  whitelists only the SWA prod origin; test slot also accepts the
  SWA preview hostname pattern. Local-dev fallback (empty env vars)
  preserves the old permissive `*`.
- **Application Insights for the agent Function App**: deferred —
  the agent reuses the Telegram bot's App Insights instance to
  minimise infra surface. Split into a dedicated instance later if
  signal noise becomes a problem.

### Parked

- _(none — v1 deployment scope is complete)_

**Acceptance test:**

- ✅ Token usage shows up in `LOG_CHANNEL_ID` (Phase 6.1 — merged).
- ✅ Forcing a tool error shows a friendly message in the web chat
  (Phase 6.2 — merged).
- ✅ All previous-phase acceptance tests still pass (regression sweep —
  Phase 6.4 — merged; manual Playwright + Telegram smokes
  **deferred** to pre-deployment).
- ✅ Page reload restores the last conversation's text (Phase 6.5 —
  merged; manual reload smoke **deferred** to pre-deployment).

---

## Cross-phase invariant — cores ↔ Telegram-adapter pattern

For every capability that needs to be on **both** surfaces:

1. **Extract the pure logic** into `src/cores/<feature>Core.js` — structured JSON return, no `bot`, no `t()`, no `sendMessage`.
2. **Refactor the existing Telegram handler** in `src/commandsHandler/<feature>Handler.js` to a thin adapter: call the core, format the result for Telegram, `bot.sendMessage`. **External behaviour must stay byte-identical** — existing handler tests must keep passing unchanged. If a test breaks, the refactor changed behaviour; fix the refactor, not the test.
3. **Wrap the same core** in an agent tool via `defineTool` in `src/agent/tools.js`.
4. **If the agent should render a rich UI**, add a `<FeatureComponent />` in `web/src/components/` and register it via `useCopilotAction({ name, available: 'frontend', render })`.
5. **Verify in-browser with Playwright MCP** before declaring "done". The browser is the source of truth for UI changes.

The full per-tool checklist (including the **cache bootstrap** and
**parallel-tool-calls** gotchas) lives in
[`AGENTS.md`](../AGENTS.md#adding-a-new-tool-checklist).

---

## Risks & open questions

- **SSE on Consumption plan**: Phase 1 verified end-to-end locally, but the local dev bridge currently buffers the full response before flushing — streaming behaviour on Azure Functions Consumption is unverified. If streaming flushing turns out to be flaky, fall back to non-streaming JSON or upgrade to Premium. Phase 6 hardening item.
- **Hebrew localisation**: out of v1 scope. The Telegram bot stays bilingual.
- **Token cost**: function-calling is more expensive than the current ASK pattern. Phase 6 adds monitoring; first cost reading is after Phase 1 deploys.
- **Cold-start cache init**: agent re-initialises caches from Azure Storage on first request. Reuses `cacheReady` promise pattern. Should be ≤5s — acceptable.
- **Open agent endpoint (no real auth, CORS-only protection)** ([PR #194](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/194)): the agent function is `authLevel: anonymous` because browsers cannot supply a function key, and `siteConfig.cors.allowedOrigins` is the only gate. Browser-based callers are restricted to the SWA prod origin (prod slot) and SWA prod + per-PR preview origin (test slot, managed by the SWA PR workflow). **Non-browser callers (curl, scripts) face no protection** — anyone who guesses `https://f1-fantazy-agent-func.azurewebsites.net/api/agent/copilotkit` can POST and burn LLM tokens. The agent's identity model is server-side (`AGENT_HARDCODED_CHAT_ID`) so abuse can't impersonate other users, but token-cost abuse is real. Monitor App Insights for unexpected traffic; harden when adopting per-user auth (see Future work).

## Future work (beyond v1)

- **Proper auth + harden the open agent endpoint** (drop `AGENT_HARDCODED_CHAT_ID` AND close the anonymous-POST hole — currently CORS is the only protection; see Risks above). Options that pair well: Azure Functions Easy Auth (Azure AD / GitHub OAuth) so each request carries a real identity token + the function reads chatId from claims instead of an env var. Same swap-out removes both the single-user constraint AND the open-endpoint risk in one step.
- Hebrew localisation of agent outputs.
- Voice input/output.
- MCP server façade so Copilot/Claude/Cursor can call the same tools.
- Write capabilities (e.g. set chip, switch team) — see
  [`agent-write-tools-plan.md`](./agent-write-tools-plan.md). PR-1
  (shared infrastructure) is delivered by #207; PR-2..PR-10 add the
  concrete tools one vertical slice at a time after it merges.
- **Rate-limiting on the agent endpoint** (Azure API Management or a CDN-layer policy) — defense in depth even after proper auth lands; relevant if abuse appears in App Insights before proper auth ships.

---

## Where to start if you're picking this up

1. **Read [`AGENTS.md`](../AGENTS.md) → "Agent (Web Chat)"** end-to-end. It has the architecture, dev workflow, every gotcha we hit, and the **"Adding a new tool" checklist** that every phase below 3 follows.
2. **Boot the dev environment** to confirm everything works: `npm install`, `cd web && npm install && cd ..`, then `npm run dev`. Open `http://localhost:5173/` and try _"Best teams for Kilzid 3 with Verstappen but no Alonso"_ — if it renders `<BestTeamsTable />` with 10 rows you're good.
3. **Pick the next phase.** Phase 3 (cross-league / followed teams) is the natural next step and is unblocked. Spin up a feature branch `feature/<you>/agent-phase3` and follow the tasks in the Phase 3 section above. Use Phase 2's commits + PR ([#181](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/181)) as the template for shape, commit-message style, and test scope.
4. **Run the rubber-duck agent** on your plan before implementing each phase — Phase 1 and Phase 2 each caught real design flaws this way that would have been expensive to fix mid-implementation.

Per-step approval policy (from the team rules): commits, pushes, and PR
creates are **separate approval points**. Don't chain them.
