# Web-chat agent write tools — rollout plan

Until v1, the f1-fantazy web-chat agent was **read-only**: 14 tools, all
of them queries (`get_current_team`, `get_best_teams`, …). The Telegram
bot, by contrast, exposes a wide range of **write** operations (select
team, set language, follow league, activate chip, …). This document is
the working plan for closing that gap — exposing the same set of writes
as agent tools without breaking the Telegram bot.

**Current state (2026-08-24):** **PR-1 (shared write-tool
infrastructure) is delivered by
[#207](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/207).**
The review-hardening pass replaced the original process-local Map with
durable Azure Table Storage and made UI confirmation server-enforced:
the authenticated `/api/agent/write-decision` endpoint must mark a
nonce approved before `confirm_write` can consume it. Cancellation
deletes the nonce immediately. The PR also ships the `defineWriteTool`
factory, shared `<WriteConfirmCard>` / `<WriteResultCard>` React
components, `registerWriteAction`, and write-semantics prompt. No
concrete write operation is registered yet, so Telegram and web-agent
user behaviour remain unchanged. **PR-2 (`set_language`)** is the
vertical-slice proof and is next after #207 merges.

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
   confirm_write."*
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
| `select_team`          | Yes (`updateUserAttributes`) + in-mem `userCache`                                      | Telegram's `userCache` re-reads on `/start` etc. — confirm reload happens before reads.          |
| `set_language`         | Yes (`updateUserAttributes`) + in-mem `i18n` map                                       | Telegram's i18n map re-reads on first `t()` call per chatId. **Verify in PR-2.**                 |
| `set_best_team_ranking`| Yes (`updateUserAttributes`) + invalidates `bestTeamsCache`                            | Telegram recomputes on next `/best_teams`. OK.                                                   |
| `activate_chip`        | **Partly:** only `selectedBestTeamByTeam` is persisted; `selectedChipCache` is in-mem. | Closed in PR-5: persist `selectedChipByTeam` so the bot/agent restart path is consistent.        |
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
  `WriteConfirmCard.tsx` (server decision first, then
  `appendMessage`), `WriteResultCard.tsx` (five status styles), and
  `registerWriteAction.tsx` (the `useWriteAction({ name, description,
  loadingLabel? })` factory hook).
- `web/src/App.tsx#AgentActions` registers
  `useWriteAction({ name: 'confirm_write', … })`.
- `src/agent/systemPrompt.js` — write-semantics paragraph appended
  before the "Today's date:" line, all backticks escaped.
- Unit tests cover durable cross-client/process behavior, approval
  enforcement, cancellation invalidation, ETag concurrency,
  abandoned-entry sweeping, webhook auth/routing, `defineWriteTool`,
  and frontend ordering (the nonce is not appended until authenticated
  approval succeeds).
- `web/package.json` — adds `@copilotkit/runtime-client-gql ^1.57.1`
  (already a transitive of `react-core@1.57.x`; needed as a direct
  dep for `TextMessage` + `Role`).

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

### PR-2 — `set_language` *(vertical-slice proof)*

Chosen as the first concrete write because it has no team validation,
is idempotent, already persists durably, and exercises every layer
end-to-end.

- Extract `src/services/setLanguageService.js`: `{ chatId, lang }` →
  validate `lang` is in `getSupportedLanguages()`, call
  `setLanguage(lang, chatId)` + `updateUserAttributes`. Returns
  `{ status, summary, lang, languageName }`.
- Refactor `setLanguageHandler.js` and the `LANG_CALLBACK_TYPE` branch
  in `callbackQueryHandler.js` to call the service. The Telegram
  adapter handles `editMessageText` and the localised phrasing.
- Register `set_language` agent tool via `defineWriteTool`.
- Register the frontend write action
  (`useWriteAction({ name: 'set_language', … })` in `App.tsx`).
- Unit tests: service, agent tool (propose envelope + confirm path),
  handler / callback regression.
- Smoke: happy path, invalid lang, cancel from confirm card,
  agent → Telegram read-back.

**Verification gate:** the full propose → confirm → commit flow
demonstrably works end-to-end via the web agent, **and** `/lang` +
LANG callback behave identically in Telegram.

### PR-3 — `select_team`

- Extract `src/services/selectTeamService.js`: validates `teamId` is in
  `userCache[chatId].teams`. Returns the standard envelope.
- Refactor the `TEAM_CALLBACK_TYPE` branch in
  `callbackQueryHandler.js` to call the service.
- Register `select_team` agent tool + frontend write action.
- Tests + smoke (`/select_team` keyboard + web `select_team` tool).

### PR-4 — `set_best_team_ranking`

- Extract `src/services/setBestTeamRankingService.js`: validates
  `teamId` ownership, validates `presetId` is in
  `BEST_TEAM_RANKING_PRESETS`, writes attribute, invalidates
  `bestTeamsCache[chatId][teamId]`.
- Refactor the `BEST_TEAM_WEIGHTS_CALLBACK_TYPE` branch to call the
  service.
- Register `set_best_team_ranking` agent tool + frontend write action.
- Tests + smoke (`/set_best_team_ranking` + web
  `set_best_team_ranking` tool).

### PR-5 — `activate_chip` *(with persistence fix)*

- Persistence decision: extend `updateUserAttributes` (or the
  existing `selectedBestTeamByTeam` serializer pattern) to also
  persist `selectedChipByTeam`. On bot / agent startup, the existing
  user-load path hydrates `selectedChipCache` from this attribute.
  Migration: missing attribute treated as empty map.
- Extract `src/services/activateChipService.js`: `{ chatId, teamId?,
  chip }` → resolves `teamId` via `pickTeamId` (same pattern as
  `best_teams`), validates chip, updates `selectedChipCache`,
  invalidates `bestTeamsCache[chatId][teamId]`, persists the new
  attribute and the existing `selectedBestTeamByTeam`. Returns the
  envelope.
- Refactor `selectChipHandlers.js#selectChip` to call the service; the
  adapter formats the Telegram message via `t()`.
- Register `activate_chip` agent tool with the chip enum + optional
  team picker.
- Tests + smoke (`/extra_boost`, `/limitless`, `/wildcard`,
  `/reset_chip` + chip callback). Cross-process smoke: activate chip
  via agent → restart bot → `/best_teams` reflects it.
- **Deployment note in PR description:** existing users get an empty
  `selectedChipByTeam` attribute on first read; their previously
  in-memory chip selection is lost. Acceptable since chip selection
  is per-race anyway.

### PR-6 — `follow_league`

- Extract `src/services/followLeagueService.js`: validate the league
  code shape (4 uppercase alphanumeric), call `getLeagueData(code)` —
  if null return `not_found`, else `addUserLeague`. Returns envelope
  including `leagueName`.
- Refactor `pendingReplyRegistry.js#follow_league`'s handler body to
  call the service.
- Register `follow_league` agent tool + frontend write action.
- Tests + smoke (`/follow_league` reply flow + web `follow_league`
  tool, both happy and `not_found` paths).

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

- **Pending-writes store is per-process / in-memory.** Acceptable
  because a confirm card only needs to survive one chat turn
  (~seconds), the store has TTL, and a server restart between propose
  and confirm is rare and recoverable (the user just re-proposes).
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
3. Open the next PR in order — almost certainly PR-2
   (`set_language`). Branch from `main` as
   `feature/doronkilzi/agent-write-set-language` (or equivalent),
   follow the PR-2 section above, and use PR-1
   ([#207](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/207))
   as the template for shape, commit-message style, and test scope.
4. **Run the rubber-duck agent on your plan before implementing.**
   PR-1 caught two real design issues this way (the nonce-ownership
   check and the `activate_chip` persistence gap) — both would have
   been expensive to fix mid-implementation.

Per-step approval policy (from the workspace rules): commits, pushes,
PR creates, and merges are **separate approval points**. Don't chain
them.
