# Agent rollout plan — F1 Fantasy web-chat agent

This is the working plan for adding a **web-chat agent** as a second
user-facing surface for the Telegram bot, plus the cost-cap data fix
that fell out of Phase 2. It's structured so anyone can pick up where
we left off without prior context.

**Current state (2026-05-16):** Phases 1 and 2 are both shipped and
merged to `main`. The cost-cap data-source fix is also merged
([f1-fantasy-api-data#19](https://github.com/F1-fantazy-bot/f1-fantasy-api-data/pull/19)
and [f1-fantazy-bot#181](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/181)).
**Phase 3 is the next natural step** and is unblocked — see the
phase-3 section below. Phases 4–6 are planned but not started.

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

**Remaining Phase-1 todo:** `p1-frontend-deploy` — provision Azure
Static Web App for `web/` and Azure Function App for `agentWebhook/`.
This is **operator-side** (needs cloud credentials) and is deferred
until ready. The agent is fully functional locally via `npm run dev`.

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

1. ✅ `src/bestTeamsCalculator.js` — optional 5th `options` arg with `mustInclude{Drivers,Constructors}` / `mustExclude{Drivers,Constructors}` filters (applied BEFORE the top-K slice so candidates outside the legacy top-K don't get lost), `rankBy: null | 'points' | 'budget_adjusted' | 'points_per_million'`, and `resultCount`. Empty/absent options preserve legacy 4-arg behaviour **byte-for-byte** — the existing 11 `bestTeamsHandler.test.js` cases pass unchanged because the refactored Telegram handler calls the calculator with the historical 4 positional args.
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

## Phase 3 — Cross-league / followed teams

**Goal:** the second user request works:
_"Best teams by points-per-million for every team I track."_
Rendered as a stack of `<BestTeamsTable />` instances, one per followed
team, each labeled with its team name + league(s).

**Telegram surface changes:** `leaderboardHandler.js` and the
followed-teams helpers get core extractions. No user-visible change.

**Tasks:**

1. Extract `src/cores/followedTeamsCore.js`. Returns the user's followed teams across all leagues, deduplicated by `teamId`: `[{ teamId, teamName, leagues: [{ leagueCode, leagueName, position }] }]`.
2. Extract `src/cores/leaderboardCore.js` from `leaderboardHandler.js`. Returns `{ leagueCode, leagueName, standings: [{ position, teamName, totalScore, ... }] }`.
3. Refactor both handlers to thin adapters; run their Jest tests — must pass unchanged.
4. Add three agent tools:
   - `list_followed_teams` (no args).
   - `get_leaderboard` (args: `leagueCode`).
   - `list_user_leagues` (no args) — small helper so the LLM knows which leagues to choose from.
5. Build rich components:
   - `web/src/components/FollowedTeamsGrid.tsx` — cards with team name, leagues + positions.
   - `web/src/components/LeaderboardTable.tsx` — standings with position, name, total score; sortable.
   - Register both via `useCopilotAction({ available: 'frontend', render })`.
6. Update system prompt to guide the LLM on cross-team workflows ("when the user says 'every team I track', call `list_followed_teams` then call `get_best_teams` for each").
7. Tests for the new cores + tools.

**Acceptance test:**

- Web app: _"Best teams by points-per-million for every team I track."_ → multiple `<BestTeamsTable />` cards, one per followed team.
- Web app: _"Show me the leaderboard for league X."_ → `<LeaderboardTable />`.
- Phase 1+2 questions still work.
- Telegram: `/leaderboard`, `/teams_tracker` → identical to before.
- `npm test` → all green.

**Open question for Phase 3:** the LLM has to fan out one "best teams for every team I track" question into N tool calls. Because of the parallel-tool-calls limitation (see "Pitfalls" in `AGENTS.md`), each `get_best_teams` call has to land in its own assistant message → each rich component renders in order. Verify in Playwright that the chat doesn't get visually janky with 5–6 sequential tables.

---

## Phase 4 — Race info, weather, deadline

**Goal:** the agent can answer all "next race" questions in detail
(weather, schedule, lock deadline, full race info) — each rendered
with a tailored component.

**Tasks:**

1. Extract cores:
   - `src/cores/nextRaceInfoCore.js` from `nextRaceInfoHandler.js`
   - `src/cores/raceWeatherCore.js` from `nextRaceWeatherHandler.js`
   - `src/cores/deadlineCore.js` from `deadlineHandler.js`
2. Refactor handlers to adapters; run their Jest tests.
3. Add three agent tools:
   - `get_next_race_info` (no args).
   - `get_race_weather` (no args; pulls next race's location).
   - `get_deadline` (no args).
4. Build rich components:
   - `web/src/components/RaceInfoCard.tsx` — circuit map (if available), full session schedule (FP1/FP2/FP3/Quali/Sprint/Race), countdown.
   - `web/src/components/WeatherForecast.tsx` — per-session weather: icon, temperature, rain probability.
   - `web/src/components/DeadlineCountdown.tsx` — live ticking countdown to the next deadline.
   - Register all three via `useCopilotAction`.
5. Tests for new cores + tools.

**Acceptance test:**

- Web app: _"What's the weather forecast for the next race?"_ → renders `<WeatherForecast />`.
- Web app: _"How long until the next deadline?"_ → renders `<DeadlineCountdown />` with a live ticking clock.
- Web app: _"Tell me about the next race."_ → renders `<RaceInfoCard />`.
- Phase 1–3 questions still work.
- Telegram: all related commands → identical to before.
- `npm test` → all green.

---

## Phase 5 — Current team + live score (last v1 capabilities)

**Goal:** complete the v1 capability scope. After this phase the agent
covers every read-only thing the Telegram bot can do, each with a
tailored component.

**Tasks:**

1. Extract cores:
   - `src/cores/currentTeamCore.js` from `currentTeamInfoHandler.js`
   - `src/cores/liveScoreCore.js` from `liveScoreHandler.js`
2. Refactor handlers to adapters; run their Jest tests.
3. Add two agent tools:
   - `get_current_team` (args: optional `teamId`).
   - `get_live_score` (args: `leagueCode`, optional `teamName` — omitted means "all teams").
4. Build rich components:
   - `web/src/components/CurrentTeamCard.tsx` — current roster, boost driver, free transfers, cost cap.
   - `web/src/components/LiveScoreBreakdown.tsx` — per-driver and per-constructor scoring breakdown with captain/mega-captain multipliers visualized.
   - `web/src/components/LiveScoreLeaderboard.tsx` — all-teams variant.
   - Register all via `useCopilotAction`.
5. Tests for new cores + tools.

**Acceptance test:**

- Web app: _"How is my current team doing this race?"_ → renders `<LiveScoreBreakdown />`.
- Web app: _"Compare my live score across all my followed teams."_ → renders `<LiveScoreLeaderboard />`.
- Phase 1–4 questions still work.
- Telegram: `/current_team_info`, `/live_score` → identical to before.
- `npm test` → all green.

---

## Phase 6 — Polish & hardening

**Goal:** make this maintainable in production. No new capabilities.

**Tasks:**

1. **Token usage logging**: per-turn `prompt/completion/total` tokens logged to the existing `LOG_CHANNEL_ID` via `sendLogMessage` (mirror `askHandler.js` pattern).
2. **Error UX**: when a tool throws or the LLM fails, render a friendly message in the web chat. Log full error to a new Application Insights instance scoped to the agent Function App.
3. **CORS hardening**: lock CORS allowlist to the production Static Web App URL only (currently permissive `*` for dev).
4. **History persistence (optional)**: persist the last 20 user turns in browser localStorage so reloading doesn't lose context.
5. **Docs**: refresh `AGENTS.md` "Agent (Web Chat)" section to capture any new gotchas discovered across Phases 3–5. Make sure the new-tool checklist still reflects current best practices.
6. **Final regression sweep**: run full `npm test` + manual smoke on Telegram for the top-10 commands.

**Acceptance test:**

- Token usage shows up in `LOG_CHANNEL_ID`.
- Forcing a tool error shows a friendly message in the web chat.
- All previous-phase acceptance tests still pass.

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

## Future work (beyond v1)

- Proper auth (drop `AGENT_HARDCODED_CHAT_ID`).
- Hebrew localisation of agent outputs.
- Voice input/output.
- MCP server façade so Copilot/Claude/Cursor can call the same tools.
- Write capabilities (e.g. set chip, switch team) — currently read-only.

---

## Where to start if you're picking this up

1. **Read [`AGENTS.md`](../AGENTS.md) → "Agent (Web Chat)"** end-to-end. It has the architecture, dev workflow, every gotcha we hit, and the **"Adding a new tool" checklist** that every phase below 3 follows.
2. **Boot the dev environment** to confirm everything works: `npm install`, `cd web && npm install && cd ..`, then `npm run dev`. Open `http://localhost:5173/` and try _"Best teams for Kilzid 3 with Verstappen but no Alonso"_ — if it renders `<BestTeamsTable />` with 10 rows you're good.
3. **Pick the next phase.** Phase 3 (cross-league / followed teams) is the natural next step and is unblocked. Spin up a feature branch `feature/<you>/agent-phase3` and follow the tasks in the Phase 3 section above. Use Phase 2's commits + PR ([#181](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/181)) as the template for shape, commit-message style, and test scope.
4. **Run the rubber-duck agent** on your plan before implementing each phase — Phase 1 and Phase 2 each caught real design flaws this way that would have been expensive to fix mid-implementation.

Per-step approval policy (from the team rules): commits, pushes, and PR
creates are **separate approval points**. Don't chain them.
