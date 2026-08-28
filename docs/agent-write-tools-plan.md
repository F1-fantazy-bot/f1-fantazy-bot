# Web-chat agent write tools — rollout plan

Until v1, the f1-fantazy web-chat agent was **read-only**: 14 tools, all
of them queries (`get_current_team`, `get_best_teams`, …). The Telegram
bot, by contrast, exposes a wide range of **write** operations (select
team, set language, follow league, activate chip, …). This document is
the working plan for closing that gap — exposing the same set of writes
as agent tools without breaking the Telegram bot.

**Current state (2026-08-28):** **PR-1 (shared write-tool
infrastructure) is merged and delivered by
[#207](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/207).**
The review-hardening pass replaced the original process-local Map with
durable Azure Table Storage and made UI confirmation server-enforced:
the authenticated `/api/agent/write-decision` endpoint must mark a
nonce approved before `confirm_write` can consume it. Cancellation
deletes the nonce immediately. The PR also ships the `defineWriteTool`
factory, shared `<WriteConfirmCard>` / `<WriteResultCard>` React
components, `registerWriteAction`, and write-semantics prompt. No
concrete write operation was registered in PR-1.
**PR-2 (`set_language`) merged as
[#216](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/216).**
It adds the first concrete write tool, its read-only `get_language`
companion, shared language persistence, cross-process Telegram
hydration, hidden confirmation control messages, and Hebrew
localization for shared write UI + race info. A follow-up localizes
`BestTeamsTable` by passing the refreshed saved language in the
`get_best_teams` tool result.
**PR-3 (`select_team`) merged as
[#219](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/219).**
It adds the shared selection service, confirmed agent tool, Telegram
callback delegation, clickable team cards, and cross-process selected-team
hydration.
**PR-4 (`set_best_team_ranking`) merged as
[#221](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/221).**
**PR-5 (`activate_chip`) merged as
[#222](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/222).**
PR [#223](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/223)
makes the durable selected team the automatic context for singular
team-scoped agent operations.
**PR-6 (`follow_league`) is implemented on the current feature branch.**
PR-7 (`unfollow_league`) is next after PR-6 merges.

> Read [`AGENTS.md`](../AGENTS.md) → "Agent (Web Chat)" first if you're
> new to this codebase. That section is the authoritative reference for
> agent architecture, dev workflow, and the read-tool checklist. This
> file is the write-tools roadmap; PR-10 below back-fills AGENTS.md
> with the matching write-tool checklist.

---

## Problem statement

Today the web-chat agent can read everything the Telegram bot can but
cannot **act** on the user's behalf. Anything that mutates Azure Tables
or Function-App-side caches (select a team, follow a league, activate a
chip, …) is reachable only via Telegram commands or callback buttons.
We want the agent to perform the same writes — through the same shared
business logic — while keeping the Telegram bot byte-identical and
keeping the LLM unable to fire side-effecting actions without an
explicit, visible user confirmation.

## Approach

1. **Effectful logic lives in `src/services/*` (new); pure read logic
   stays in `src/cores/*`.** Both the Telegram adapter
   (handlers / `callbackQueryHandler` / `pendingReplyRegistry`) and the
   agent tool call the same service. The service is the single source
   of truth for "do the thing"; the adapter only translates inputs and
   outputs.
2. **UI confirmation via a durable nonce plus authenticated approval,
   not just an LLM-supplied `confirmed` flag.** Each write tool stages a
   one-time `writeNonce` in Azure Table Storage on its first call (**no
   side effect**). Possession of the nonce is insufficient:
   `confirm_write` consumes only records whose state was changed from
   `staged` to `approved` by the authenticated
   `/api/agent/write-decision` endpoint after the user clicks Yes. The
   model has no tool that can call that endpoint. Cancellation deletes
   the record immediately.
3. **Phased rollout, one vertical slice at a time.** After each phase:
   full `npm test` stays green, the Telegram smoke checklist passes
   for the affected commands, and the web-agent smoke passes for the
   new tool.
4. **Identity comes from `getAgentChatId()` (AsyncLocalStorage) for
   every write tool — never an LLM arg.** Every write tool calls
   `await ensureCacheReady()` before touching cache state, so the
   propose/confirm pair tolerates cold starts on Consumption.

## Write tools to add (8)

| Tool                    | Service                                       | Existing Telegram caller                                              |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `select_team`           | `src/services/selectTeamService.js`           | `callbackQueryHandler.js` (TEAM)                                      |
| `set_language`          | `src/services/setLanguageService.js`          | `setLanguageHandler.js` + callback (LANG)                             |
| `set_best_team_ranking` | `src/services/setBestTeamRankingService.js`   | callback (BEST_TEAM_WEIGHTS)                                          |
| `activate_chip`         | `src/services/activateChipService.js`         | `selectChipHandlers.js`                                               |
| `follow_league`         | `src/services/followLeagueService.js`         | `pendingReplyRegistry.js#follow_league`                               |
| `unfollow_league`       | `src/services/unfollowLeagueService.js`       | callback (LEAGUE_UNFOLLOW)                                            |
| `follow_team`           | `src/services/followTeamService.js`           | `utils/leagueTeamHelpers.js` + `/teams_tracker`                       |
| `report_bug`            | `src/services/reportBugService.js`            | `pendingReplyRegistry.js#report_bug`                                  |

Plus a 9th supporting tool, shipped in PR-1:

| Tool            | Purpose                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `confirm_write` | Generic commit tool — takes `{ writeNonce }`, looks up the pending intent, executes it, returns the standard result envelope.            |

---

## Cross-cutting design decisions

### Confirmation protocol (durable nonce + server-enforced approval)

1. The user asks the agent to do a write.
2. The LLM calls e.g. `follow_league({ leagueCode: "ABC" })`.
3. The tool validates args, awaits `ensureCacheReady()`, stages the
   serializable intent in Azure Table `PendingAgentWrites` under
   `{ partitionKey: chatId, rowKey: nonce, state: "staged" }`, and returns
   ```json
   {
     "status": "confirmation_required",
     "writeNonce": "…",
     "tool": "follow_league",
     "summary": "Follow league \"…\" (code ABC).",
     "args": { … }
   }
   ```
4. The frontend's render hook detects `confirmation_required` and shows
   `<WriteConfirmCard>` (summary + Yes / No buttons). The UI does not
   auto-call the LLM.
5. On **Yes**, the card POSTs `{ writeNonce, decision: "approve" }` to
   `/api/agent/write-decision` with the user's Google bearer token. The
   webhook runs the same auth + allowlist pipeline as chat traffic and
   updates the matching chatId-owned row to `state: "approved"` with an
   ETag condition. Only after that succeeds does the UI append *"Yes —
   I approved this change. Use writeNonce `<nonce>` with
   confirm_write."* as an AG-UI `developer` message directly to the v2
   agent, then calls
   `copilotkit.runAgent({ agent })` with that SAME instance. The
   coordinated runner detaches any active proposal run before starting
   the confirmation turn. CopilotKit's chat renderer returns `null` for
   developer messages and the history store drops them, so the nonce
   remains model-visible but never user-visible or persisted. Do not mix
   legacy `appendMessage` with a
   separately acquired agent (provisional instances can differ during
   reconnect), call `agent.runAgent()` directly (it can overlap the
   proposal run), or use `runChatCompletion` (declared but absent at
   runtime in CopilotKit 1.57.4).
   `BuiltInAgent` MUST keep `forwardDeveloperMessages: true`; otherwise
   CopilotKit drops the hidden instruction before model conversion.
6. The LLM calls `confirm_write({ writeNonce })`. The tool returns
   `forbidden` for a still-staged row. For an approved row it performs
   an ETag-protected delete; only the Function instance that wins that
   atomic delete invokes the registered service. This gives single-use
   semantics across scale-out and returns `{ status: 'ok' | …,
   summary, … }`.
7. On **No**, the card POSTs `decision: "cancel"` to the same
   authenticated endpoint. The server deletes the row immediately,
   then the UI appends a nonce-free cancellation message.
8. A throttled table sweep deletes abandoned expired rows. Every point
   lookup also enforces the ~5 minute expiry.

The model sees the nonce in the proposal result, but it **cannot
self-confirm**: an immediate same-run `confirm_write` sees
`state: "staged"` and returns `forbidden`; no LLM-accessible tool can
transition the durable row to `approved`.

### Shared result envelope

```js
{
  status:
    | 'confirmation_required'
    | 'ok'
    | 'invalid_input'
    | 'not_found'
    | 'forbidden'
    | 'limit_exceeded'
    | 'tool_error',
  summary,
  writeNonce?,
  details?,
}
```

One React render hook (`<WriteResultCard>`) switches on `status`. The
`tool_error` branch keeps using the existing `wrapToolExecute`
redaction so secrets never leak into chat history.

### Cache coherence (cross-process)

The agent (Azure Functions process) and the Telegram bot (separate
process) have **separate in-memory caches**. Every write op must be
classified for cross-process behaviour:

| Op                     | Durable today                                                                          | Notes                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `select_team`          | Yes (`updateUserAttributes`) + in-mem `userCache`                                      | PR-3 refreshes the persisted profile before Telegram message/callback dispatch and before agent no-op detection. Reads are bounded/coalesced; every local selected-team writer advances a per-chat generation so stale reads cannot overwrite newer writes. |
| `set_language`         | Yes (`updateUserAttributes`) + in-mem `userCache.lang`                                  | PR-2 uses an outer 750 ms deadline plus a per-chat generation guard while refreshing persisted language before Telegram routes messages **and** callbacks. |
| `set_best_team_ranking`| Yes (`updateUserAttributes`) + invalidates `bestTeamsCache`                            | Telegram recomputes on next `/best_teams`. OK.                                                   |
| `activate_chip`        | Yes (`selectedChipByTeam` + normalized `selectedChipCache`)                            | PR-5 persists and hydrates per-team chip state across bot/agent hosts and restarts.              |
| `follow_league`        | Yes (`addUserLeague` → Azure Tables)                                                   | Each surface reads on demand. OK.                                                                |
| `unfollow_league`      | Yes (`removeUserLeague` → Azure Tables)                                                | OK.                                                                                              |
| `follow_team`          | Yes (`saveUserTeam` / `deleteUserTeam` → Azure Tables)                                 | OK.                                                                                              |
| `report_bug`           | Send-only (no shared state)                                                            | OK.                                                                                              |

### Telegram regression bar

After every PR, **existing Telegram handler tests must keep passing
unchanged.** Adapter-level wording tests may need minor tweaks if a
service now returns structured status that the adapter formats — that
is acceptable, **but only if Telegram user-visible output stays
identical.** If a test breaks because the refactor changed Telegram
output, fix the refactor, not the test.

### System prompt cost

A single write-semantics paragraph is added to `systemPrompt.js`
(landed in PR-1) instead of being repeated per tool:

```
Write tools always require confirmation. Never auto-confirm. Do not
call confirm_write unless the user explicitly approved. Do not chain a
propose call and a confirm_write in the same turn — wait for the
user's reply. Each writeNonce is single-use; if the user changes their
mind, propose again to get a fresh nonce.
```

Per-tool descriptions stay short: args + side-effect summary only.

---

## PR-per-phase delivery model

Every phase ships as its own branch and PR so it can be independently
reviewed, manually verified, and merged before the next phase starts.

- Branch naming: `feature/doronkilzi/agent-write-<slug>` (per the
  workspace rules).
- Each PR targets `main`, contains only its phase's changes, and ships
  with:
  - All new / changed code for that phase.
  - Full `npm test` green.
  - Smoke checklist results in the PR description (Telegram + web,
    including error paths relevant to that tool).
  - Migration / deployment notes (e.g. PR-5's chip-persistence
    migration).
- After the shared-infra PR, phases are functionally independent: once
  PR-2 lands and is verified (the vertical-slice proof), PR-3..PR-9
  may be opened in parallel against main if there is reason to.
- **Sequencing rule:** do not start phase N+1 (open its branch) until
  phase N's PR is merged and the verification gate is confirmed.
- Per the workspace rules, each write-side git / gh op (commit, push,
  PR create, merge) is approved separately — no chained approvals.

---

## Phases / PRs

### PR-1 — Shared write infrastructure (#207)

Originally Phase 0 (audit-only) and Phase 1 (infrastructure) combined.
The cache-coherence audit findings are folded into the table above and
into the per-tool sections below. Shipped as
[#207](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/207).

**What landed:**

- New `src/services/` directory (currently holding only the store; PRs
  2–9 fill it out).
- `src/services/pendingWritesStore.js` — Azure Table-backed durable
  intents with TTL ~5 min, chatId partitioning, explicit
  `staged`/`approved` states, immediate cancellation, throttled expiry
  sweep, and ETag-protected atomic consume. Propose and confirm can run
  on different Function instances or across a host recycle.
- `src/agent/writeDecision.js` + authenticated webhook route
  `/api/agent/write-decision` — the only path that can approve or
  cancel an intent. Runs after Google auth + allowlist resolution;
  local bypass uses the configured hardcoded chatId.
- `src/agent/writeToolHelpers.js` — `defineWriteTool({ name,
  parameters, validate, buildSummary, execute })` factory wiring
  `ensureCacheReady`, the nonce stage, `wrapToolExecute`, and the
  standard envelope. Also exports `executeConfirmedWrite` and an
  internal `WRITE_TOOL_REGISTRY` Map keyed by tool name.
- `src/agent/tools.js` — registers the supporting `confirm_write`
  tool. Tool count: 14 → 15.
- Frontend shared primitives in `web/src/components/`: `safeParse.ts`,
  `WriteDecisionContext.tsx` (authenticated decision client/provider),
  `WriteConfirmCard.tsx` (server decision, hidden developer message via
  `agent.addMessage`, then coordinated
  `copilotkit.runAgent({ agent })`),
  `WriteResultCard.tsx` (five status styles), and
  `registerWriteAction.tsx` (the `useWriteAction({ name, description,
  loadingLabel? })` factory hook).
- `src/agent/runtime.js` enables `forwardDeveloperMessages: true` so
  hidden nonce instructions reach the model as system messages while
  remaining absent from the chat renderer/history.
- `web/src/App.tsx#AgentActions` registers
  `useWriteAction({ name: 'confirm_write', … })`.
- `src/agent/systemPrompt.js` — write-semantics paragraph appended
  before the "Today's date:" line, all backticks escaped.
- Unit tests cover durable cross-client/process behavior, approval
  enforcement, cancellation invalidation, ETag concurrency,
  abandoned-entry sweeping, webhook auth/routing, `defineWriteTool`,
  and frontend ordering (the nonce is not appended until authenticated
  approval succeeds).
- The confirmation card uses the v2 AG-UI agent's native
  `addMessage` API, so no direct `@copilotkit/runtime-client-gql`
  dependency is needed.

**Verification gate:**

- All tests green; `npm ci` + `npm run build` green on CI.
- `confirm_write` registered but a no-op (nothing to confirm yet) —
  manually verified callable from a web-agent session without errors.
- No user-visible change in Telegram or web agent.

#### Lessons learned during PR-1

Three CI gotchas surfaced and are documented here so future write-tool
PRs can avoid them.

1. **Lockfile platform-binary pruning.** Local `npm install` on
   darwin-arm64 with **npm 11.x** silently drops optional
   cross-platform binaries (`@esbuild/{netbsd-arm64, openbsd-arm64,
   openharmony-arm64, sunos-x64, win32-*, …}@<version>`) from
   `web/package-lock.json`. CI on Linux runs `npm ci` with **npm 10.x**
   bundled with Node 22 and rejects the resulting lockfile with
   `Missing: esbuild@<version> from lock file`. **Fix:** restore the
   lockfile from `main`, then add only the new direct-dep line by
   hand. Do **not** re-run `npm install` on darwin-arm64 / npm 11 — it
   will prune again. Long-term mitigation (separate PR): pin
   `engines.npm` in `web/package.json` and add `engine-strict=true` in
   `web/.npmrc`, or downgrade the dev machine to npm 10.x.
2. **SWA CLI production-environment name.** The dedicated test SWA's
   default environment is named `production` by the SWA CLI. Passing
   `--env default` builds successfully but the content service rejects
   deployment with `BadRequest: environment name "default" is
   invalid`. The PR workflow now uses `--env production`.
3. **SWA deploy intermittent timeout.** The
   "Build and deploy web frontend … (PR validation)" job uses
   `npx -y @azure/static-web-apps-cli@latest deploy`. The CLI
   downloads `StaticSitesClient`, which has a hard-coded ~10 min
   deploy timeout. If Azure SWA's backend stalls during "Preparing
   deployment", the binary exits 1 with a generic
   "deployment binary exited with code 1" message and a misleading
   "check shared libraries" hint. The symptom is **always** ~10m17s
   between "Preparing deployment" and the exit. **Fix:** re-run the
   job (`gh run rerun <id> --failed`). Long-term mitigation: pin the
   SWA CLI to a known-good version instead of `@latest` so we control
   the deploy-binary revision.

### PR-2 — `set_language` ✅ Merged ([#216](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/216))

Chosen as the first concrete write because it has no team validation,
is idempotent, already persists durably, and exercises every layer
end-to-end.

- `src/services/setLanguageService.js` owns validation, durable
  `updateUserAttributes({ lang })`, local `setLanguage`, and
  cross-process `refreshLanguagePreference(chatId)`. Persistence runs
  before local mutation so a storage outage cannot create a
  success-looking one-process-only change.
- `setLanguageHandler.js` and the `LANG_CALLBACK_TYPE` branch in
  `callbackQueryHandler.js` delegate to the service. Telegram still
  formats the same localized success/invalid text and owns
  `sendMessage` / `editMessageText`.
- `messageHandler.js` and `callbackQueryHandler.js` refresh the
  persisted language before routing allowed Telegram messages and
  inline-button callbacks. An outer 750 ms deadline wraps table
  initialization plus the point read (and also aborts the SDK request);
  failure logs and falls back to the current cache so a UserRegistry
  outage cannot block Telegram indefinitely. Concurrent refreshes for
  one chat share a single in-flight Azure lookup; local writes advance a
  per-chat generation token that invalidates any older read before it
  can mutate cache. This prevents both stale refresh-vs-write and
  refresh-vs-refresh overwrites. This is the
  cross-process read-back proof: a write in the agent Function becomes
  visible to the separate Telegram Function without requiring a host
  restart.
- `src/agent/writeTools/setLanguageTool.js` registers
  `set_language({ lang: "en" | "he" })` via `defineWriteTool`.
  Invalid language values return the standard `invalid_input` envelope
  before staging. Requesting the already-active language returns
  `{ status: "ok", changed: false }` immediately — no confirmation
  nonce or redundant Azure write — but only when a successful durable
  refresh confirms the match. If freshness cannot be established, the
  tool proceeds through confirmation and persists the requested value.
- The read-only `get_language` tool answers "what language is configured
  on my account?" without routing through `set_language`. It performs
  the same bounded durable refresh first, so a warm agent instance
  cannot answer from stale startup cache.
  If the durable refresh times out, the tool returns the cached language
  with an explicit "could not verify" summary instead of presenting it
  as confirmed durable state.
- `web/src/App.tsx` registers the generic write renderer for
  `set_language`; the shared confirmation/result cards from PR-1 need
  no tool-specific component. The write envelopes carry `uiLang`, so
  the full confirmation/result shells (titles, buttons, details) render
  in Hebrew when the current saved language is Hebrew.
- `get_next_race_info` enriches its tool result with the saved language;
  it refreshes that preference before rendering so warm instances stay
  current. `RaceInfoCard` localizes schedule/weather/history/table
  labels, uses `he-IL` date formatting, selects Hebrew track history,
  and renders RTL.
- `get_best_teams` follows the same contract: refresh the durable
  language, include `lang` on both success/error results, and let
  `BestTeamsTable` render Hebrew header/filter/table/legend/error labels
  with RTL layout while keeping driver/constructor codes unchanged.
- The contract now applies to **every** registered rich renderer.
  `src/agent/tools.js#withUiLanguage` enriches read-tool results with the
  refreshed saved `lang`; the React components render English or
  Hebrew/RTL from that field:
  - `NextRacesTable`, `UserTeamsList`, `FollowedTeamsGrid`
  - `LeaderboardTable`, `BestTeamsTable`,
    `BestTeamScenariosMatrix`
  - `RaceInfoCard`, `WeatherForecast`, `DeadlineCountdown`
  - `CurrentTeamCard`, `LiveScoreBreakdown`,
    `LiveScoreLeaderboard`
  - shared `ToolErrorFallback`, `WriteConfirmCard`,
    `WriteResultCard`
  Proper names and F1 driver/constructor/team codes stay unchanged.
  `AllRichComponentsHebrew.test.tsx` is the regression gate—when adding
  another renderer, add it to that matrix.
- Loading branches have no tool result yet, so `/api/agent/whoami`
  returns the durable `lang` and `AccessVerifier` initializes a shared
  `UiLanguageProvider`. All action hooks render `ToolLoading`; successful
  writes synchronize the context. `ToolLoading.test.tsx` covers all
  loading kinds. Local bypass mode performs the same whoami probe for
  the hardcoded user. The endpoint reuses the bounded/coalesced language
  refresh so presentation metadata cannot stall login.
- `confirm_write` refreshes the durable preference before building
  expected failure envelopes (`forbidden`, expired/missing nonce,
  missing handler), so Hebrew users do not get an English result shell
  or English failure summary from a warm worker with stale startup
  cache.
- Tests cover service persistence ordering, invalid input, cross-process
  hydration, unchanged Telegram handler/callback routing, tool
  configuration, and the complete propose → rejected-premature-confirm
  → authenticated approval → commit flow. UI tests cover Hebrew
  confirmation/result shells and Hebrew race-info rendering.

**Verification gate:** the full propose → confirm → commit flow
demonstrably works end-to-end via the web agent, **and** `/lang` +
LANG callback behave identically in Telegram.

### PR-3 — `select_team` ✅ Merged ([#219](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/219))

- `src/services/selectTeamService.js` validates the requested canonical
  `teamId` or exact case-insensitive display name against
  `currentTeamCache[chatId]`, persists `UserRegistry.selectedTeam` before
  mutating local cache, and returns the standard status envelope.
- Name-based proposals are canonicalized to `teamId` before their durable
  pending intent is staged. Confirmation therefore commits the exact team
  shown in the card even if display names or tracked teams change while
  the nonce is pending.
- `src/services/userProfileSyncService.js` provides one bounded/coalesced
  `getUserById` lookup. Language and selected-team refreshes reuse it, and
  `src/services/telegramUserPreferencesService.js` refreshes both before
  Telegram message and callback routing.
- Every local selected-team mutation uses the generation-aware
  `setCachedSelectedTeam` helper. A registry read started before a local
  write cannot overwrite the newer selection when it eventually returns,
  and a refresh started after the write cannot reuse a pre-write shared
  profile request. Writers persist first and call the helper afterward.
- `TEAM_CALLBACK_TYPE` delegates to the service. Invalid/stale callbacks
  show a localized, bounded alert instead of attempting a mutation.
- `src/agent/writeTools/selectTeamTool.js` and the generic frontend write
  action register `select_team`. Same-team requests skip confirmation only
  when a fresh durable read proves the requested team is already active.
- `UserTeamsAction` makes non-active cards selectable without relying on
  model routing. A click posts the canonical team ID to the authenticated,
  `select_team`-only `/api/agent/write-proposal` route, which runs the same
  proposal validator/staging function and renders the returned confirmation
  card immediately. Its authenticated `approve_and_confirm` decision approves,
  consumes, and commits the durable single-use nonce server-side, so card
  selection never depends on a second model turn.
- Conversational selection remains supported: after the agent lists teams,
  a short team-name/id reply is treated as the answer to that pending switch.
  The system prompt requires `select_team` in the same turn and forbids
  claiming an approval card exists before the tool actually returns
  `confirmation_required`. A named switch with no recent list calls
  `select_team({ teamName })` directly; all teams are rendered only when the
  user needs a choice or disambiguation. Successful results notify any
  visible team grid to refresh its active highlight.
- Tests cover ownership, persistence ordering/failure, stale-read races,
  name canonicalization, proposal/approval/confirm, Telegram callbacks,
  and cross-process preference refresh.

### PR-4 — `set_best_team_ranking` ✅ Merged ([#221](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/221))

- `src/services/setBestTeamRankingService.js` owns the four preset
  definitions, exact team/preset validation, localized envelopes, durable
  no-op detection, selected-best-team clearing, and per-team
  `bestTeamsCache` invalidation.
- Ranking and selected-best maps are whole JSON attributes. Writes use
  `updateUserAttributesAtomically`: an ETag compare-and-swap transform with
  retry against the latest `UserRegistry` entity. Concurrent changes to
  different teams cannot overwrite each other, and removing the last
  selection cannot replace unrelated user attributes. Existing selected-best
  writers were migrated to `selectedBestTeamService`, so no process-local
  whole-map write can bypass the CAS boundary.
- The shared profile hydration path refreshes language, selected team,
  ranking preferences, and selected-best state together before Telegram
  message/callback routing. Generation guards prevent pre-write reads from
  restoring stale maps.
- `get_best_teams` and `get_current_team` refresh ranking state before
  their cores run, so Telegram changes invalidate stale calculations in the
  separate agent Function process.
- `BEST_TEAM_WEIGHTS_CALLBACK_TYPE` delegates to the service while retaining
  the Telegram confirmation/recalculation text. Stale callbacks show a
  bounded localized alert.
- `set_best_team_ranking({ teamId?, teamName?, presetId })` canonicalizes
  the owned team, validates preset IDs, skips confirmation only after a
  durable no-op proof, and uses the shared confirmation/result cards.
- Tests cover CAS retries, unrelated-field preservation, persistence
  ordering/failure, default Pure Points semantics, stale-read races,
  cross-process hydration/invalidation, Telegram parity, prompt routing,
  and propose → approve → confirm.

### PR-5 — `activate_chip` *(with persistence fix)* ✅ Merged ([#222](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/222))

- `selectedChipByTeam` is a normalized `UserRegistry` JSON map; missing or
  malformed data means no chips, and `WITHOUT_CHIP` is represented by an
  absent entry. Startup and per-route hydration populate
  `selectedChipCache` only for currently owned team blobs.
- `src/services/activateChipService.js` validates authoritative ownership
  and chip values, performs durable no-op detection, atomically updates chip
  plus selected-best maps, and invalidates only affected calculations.
- Top-level team/chip mutations use a re-entrant process queue plus a durable
  per-user lease in Azure Table `UserMutationLocks`. After lease acquisition,
  authoritative team blobs and `UserRegistry` attributes hydrate before any
  source/ownership decision.
- `teamStateSnapshotService` provides compensation for partial Blob/Table
  failures. Import, reset, source conversion, Teams Tracker, screenshot
  assignment, follow/remove, active-team selection, ranking writes, and
  selected-best number input share the same transaction boundary.
- `selectChipHandlers.js` is now a thin Telegram adapter. Existing
  `/extra_boost`, `/limitless`, `/wildcard`, and `/reset_chip` output is
  preserved; no-ops do not claim calculations were invalidated.
- `activate_chip({ teamId?, teamName?, chip })` supports `EXTRA_BOOST`,
  `LIMITLESS`, `WILDCARD`, and `WITHOUT_CHIP`, canonicalizes owned teams,
  and skips confirmation only after durable no-op proof.
- Agent `list_user_teams`, `get_best_teams`, `get_best_team_scenarios`, and
  `get_current_team` refresh persisted chip state before their cores run.
- Tests cover normalization/startup migration, CAS and write serialization,
  authoritative deletion races, durable lease ownership, source/import/reset
  compensation, Telegram parity, prompt routing, and propose → approve →
  confirm.
- Follow-up default-context rule: singular team-scoped reads/writes omit
  team arguments and use the durable selected team automatically. The agent
  asks for a team only when selection is unavailable, a different target was
  requested, `select_team` itself needs a target, or the request is
  explicitly multi-team.
- **Deployment note in PR description:** existing users get an empty
  `selectedChipByTeam` attribute on first read; their previously
  in-memory chip selection is lost. Acceptable since chip selection
  is per-race anyway.

### PR-6 — `follow_league` 🟡 Implemented (current branch)

- `followLeagueService` trims/uppercases 3-20 character alphanumeric share
  codes, verifies the league standings blob, detects an existing durable
  follow, and persists through `UserLeagues`.
- Telegram's `follow_league` pending-reply handler delegates to the service
  while preserving retry prompts. Azure failures are logged internally and
  shown as a generic localized message without raw storage details.
- `follow_league({ leagueCode })` validates existence before staging,
  canonicalizes the code in the pending intent, skips confirmation for a
  durable no-op, and revalidates at commit. A missing league returns the same
  actionable guidance as Telegram for finding the Share code. Telegram keeps
  `/report_bug`; the agent instead tells users to contact administrators
  because it cannot submit missing-league reports yet.
- Tests cover invalid/missing/existing/new leagues, Telegram retry/error
  behavior, language ordering, prompt routing, and propose → approve →
  confirm.

### PR-7 — `unfollow_league`

- Extract `src/services/unfollowLeagueService.js`: validates the user
  follows this league via `listUserLeagues`, then `removeUserLeague`.
  Returns envelope.
- Refactor the `LEAGUE_UNFOLLOW_CALLBACK_TYPE` branch in
  `callbackQueryHandler.js` to call the service.
- Register `unfollow_league` agent tool + frontend write action.
- Tests + smoke (`/unfollow_league` inline keyboard + web
  `unfollow_league` tool).

### PR-8 — `follow_team`

- Extract `src/services/followTeamService.js`. Inject explicit ports
  (no bot shim):
  - `storage`: `saveUserTeam` / `deleteUserTeam` from
    `userTeamRegistryService`.
  - `logger`: `sendLogMessage`-equivalent (real `getNotifierBot` in
    production, fake in tests).
  - `sourceSwitcher`: `ensureSourceIsLeague`.
- Move `MAX_FOLLOWED_LEAGUE_TEAMS` enforcement **into the service** so
  every caller is capped, not just `/teams_tracker`. Add a
  characterization test BEFORE moving, to confirm current
  `followLeagueTeam` callers' behaviour
  (`git grep -n followLeagueTeam` will list them).
- The confirmation summary text **must explicitly call out
  cross-source side effects**: *"This will remove your screenshot
  teams T1/T2/T3 and activate league team '<teamName>'."*
- Tool args: `{ action: 'add' | 'remove', leagueCode, teamId? |
  teamName? }`. If only `teamName` is supplied, the service resolves
  to `teamId` via the league blob; an ambiguous match returns
  `invalid_input` with a disambiguation hint.
- Refactor existing `followLeagueTeam` / `removeFollowedTeam` helpers
  to delegate to the service (helpers stay as thin Telegram-side
  wrappers).
- Tests + smoke, including: follow over cap (expect `limit_exceeded`),
  follow with an active screenshot team present (confirm summary
  mentions the wipe), remove flow.

### PR-9 — `report_bug` *(with abuse controls)*

- Extract `src/services/reportBugService.js` with an injected
  `messenger` port: `{ sendToAdmins(text), sendToBugsGroup(text) }`.
  Telegram adapter passes the real bot; the agent passes a thin
  `notifierBot`-backed messenger.
- Abuse controls (added during rubber-duck critique #8):
  - Length cap: `MAX_BUG_REPORT_LENGTH = 4000`. Over-length returns
    `invalid_input`.
  - Per-chat rate limit: max 3 reports / hour (in-memory window).
    Excess returns `forbidden`.
  - Admin / group message includes a
    `Source: web-agent | telegram` line and the authenticated `email`
    if available.
- Refactor `pendingReplyRegistry.js#report_bug` to call the service.
- Register `report_bug` agent tool.
- Replace the temporary "contact administrators" guidance in
  `follow_league` not-found results with a one-click **Report missing
  league** action. Prefill the report with the attempted league code and
  route it through the authenticated `report_bug` confirmation/abuse-control
  flow; the user must not need to retype the code.
- Tests + smoke (Telegram `/report_bug` + web agent, including
  length-cap and rate-limit error paths).

### PR-10 — AGENTS.md wrap-up

- Update `AGENTS.md`:
  - New "Effectful write services" section distinguishing
    `src/services/*` from `src/cores/*`.
  - "Adding a new write tool" checklist (parallel to the existing
    read-tool checklist).
  - The server-side nonce confirmation protocol documented in one
    place.
  - List of 8 + `confirm_write` agent tools.
- Final full `npm test` pass.
- Final manual smoke pass: Telegram polling local **and** web agent
  local — exercise every affected Telegram surface and every new
  agent tool, including the cross-surface read-back checks from the
  PR-1 verification gate.
- Docs / notes only — no functional code changes.

---

## Risks accepted

- **Pending-write cleanup is traffic-triggered.** Intents are durable
  in Azure Table Storage and rejected immediately after expiry. A
  throttled global sweep runs when new proposals arrive; during a
  completely idle period, expired rows may remain stored until the
  next proposal, but they are never consumable and do not retain
  process memory.
- **Chip cache cross-process divergence pre-PR-5.** PR-5 closes this.
- **System prompt token cost.** Mitigated by a single shared
  write-semantics paragraph plus short per-tool descriptions.

## Out of scope (user opted out)

- `teams_tracker_save` (batch tracker save tool).
- `reset_cache`.
- Admin write tools (`/broadcast`, `/set_nickname`,
  `/allow_web_user`, `/trigger_*`).
- Per-tool rich UI components — only the two shared cards.

---

## Where to start if you're picking this up

1. Read [`AGENTS.md`](../AGENTS.md) → "Agent (Web Chat)" end-to-end
   first.
2. Boot the dev environment: `npm install`,
   `cd web && npm install && cd ..`, then `npm run dev`. Open
   `http://localhost:5173/` and try any existing read tool — the
   shared cards are no-op until you wire a write.
3. Open the next PR in order — PR-4 (`set_best_team_ranking`) after
   PR-3 merges. Branch from `main` as
   `feature/doronkilzi/agent-write-best-team-ranking` (or equivalent),
   follow the PR-4 section above, and use PR-1
   ([#207](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/207))
   as the template for shape, commit-message style, and test scope.
4. **Run the rubber-duck agent on your plan before implementing.**
   PR-1 caught two real design issues this way (the nonce-ownership
   check and the `activate_chip` persistence gap) — both would have
   been expensive to fix mid-implementation.

Per-step approval policy (from the workspace rules): commits, pushes,
PR creates, and merges are **separate approval points**. Don't chain
them.
