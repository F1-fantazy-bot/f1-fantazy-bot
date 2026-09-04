# Telegram/Agent Capability Parity Plan

## Goal

Bring every Telegram capability that makes sense in conversational web chat to
the agent, while preserving Telegram behavior and enforcing that future
Telegram commands cannot ship without an agent implementation or an explicit,
reviewed exception.

The implementation is capability-oriented rather than command-oriented:
Telegram keeps slash commands and inline keyboards; the agent gets natural
language routing, structured tools, rich cards, guided target selection, and
confirmed writes.

## Current status

- Roadmap published in PR #230.
- Phase 1 merged in PR #231: the 50-command manifest, registry parity tests,
  shared admin chat-ID predicate, fail-closed admin wrappers, and
  wrapper-registration enforcement are in place.
- Phase 2 merged in PR #232: `/help` and `/flow`
  consume a shared guide model, and `get_agent_guide` provides personalized,
  localized, agent-native onboarding and capability guidance. Guide task cards
  execute their example prompts directly with one shared per-agent run lock,
  keyboard-safe interaction, and message rollback on failed starts. Examples
  use the authenticated user's actual selected/owned team and followed league
  names, and cards are hidden when their prerequisites are unavailable.
- Phase 3 merged in PR #234: league-change comparison is extracted into a pure
  structured core, Telegram formatting is unchanged, and
  `get_league_changes` adds followed-league authorization, canonical clickable
  selection, safe error envelopes, and an accessible localized English/Hebrew
  rich component.
- Phase 4 merged in PR #235: the three league graph
  series come from one pure core while Telegram keeps its existing QuickChart
  output. `get_league_graph` provides authorized league/type card selection and
  structured data for a localized, accessible English/Hebrew web chart.
- Phase 5 merged in PR #236: race-summary facts are extracted into a pure
  core, Telegram and the agent share one controlled nested-model service, and
  `get_race_summary` provides authorized canonical league selection plus a
  localized English/Hebrew rich recap.
- Phase 6 merged in PR #237: `/whats_new` and `get_whats_new` share the same
  announcement core and render a localized, safe rich announcement card.
- Phase 7 merged in PR #238: `/get_current_simulation` and `/print_cache`
  share public-safe diagnostics cores with `get_simulation_status` and
  `get_data_status`, including saved-language Asia/Jerusalem times and
  structured cached projections/rosters instead of raw cache JSON.
- Phase 8 merged in PR #239: `/load_simulation` is delegated to one
  serialized simulation-refresh service and exposed as a confirmed agent
  action with an explicit per-process cache boundary.
- Phase 9 merged in PR #240: `/reset_cache` now delegates to a reset-safe
  shared service and `reset_user_data` exposes the same confirmed action to
  the agent.
- Phase 10 merged in PR #241: the five read-only admin capabilities use
  central guards, safe structured views, and localized agent cards.
- Phase 11 merged in PR #242: confirmed admin identity/access writes share a
  service with Telegram and use guided directory targets.
- Phase 12 merged in PR #243: confirmed admin messaging shares delivery and
  audience-validation services with Telegram.
- Phase 13 is in progress: confirmed admin manual triggers are gaining durable
  job-scoped deduplication and safe run references.

## Locked decisions

- Add all agent-suitable missing user capabilities:
  - league graphs
  - league changes
  - race summaries
  - simulation status and refresh
  - readable data diagnostics and destructive reset
  - release announcements
  - contextual agent guidance
- Replace `/help` and `/flow` with one agent-native guide. It provides
  personalized next steps and example prompts rather than reproducing a slash
  command list.
- `/menu` and `/start` have no agent equivalent.
- The current one-team-at-a-time guided `teams_tracker` behavior is sufficient.
  Batch multi-select is deferred.
- Add every admin command except the two image-import commands.
- `/upload_drivers_photo` and `/upload_constructors_photo` remain permanently
  Telegram-only.
- Agent admin authorization uses the same admin identity as Telegram:
  authenticated Google email -> allowlisted Telegram chatId ->
  server-side `isAdminChatId(chatId)`. Prompt/UI hiding is not the security
  boundary.
- Manual jobs are separate confirmed tools, not one generic trigger tool.
- Admin messaging uses guided recipient selection and a preview. Broadcast
  confirmation includes the resolved recipient count. Agent messaging starts
  text-only; Telegram remains the surface for sending images until a general
  secure attachment pipeline exists.
- Deliver as small vertical PRs. Because the repository has one fixed PR test
  environment, merge and verify each PR before deploying the next even where
  code dependencies would technically allow parallel work.

## Final command disposition

### Existing full parity

Retain the existing agent mappings for:

- `/best_teams`
- `/best_team_scenarios`
- `/current_team_info`
- `/chips`, `/extra_boost`, `/limitless`, `/wildcard`, `/reset_chip`
- `/lang`
- `/select_team`
- `/set_best_team_ranking`
- `/next_race_info`
- `/next_races`
- `/next_race_weather`
- `/deadline`
- `/live_score`
- `/follow_league`
- `/unfollow_league`
- `/leaderboard`
- `/report_bug`

### Existing adapted parity

- `/teams_tracker`: the agent supports list/add/remove through guided cards and
  one confirmation per team. Telegram's batch toggle/Save session remains
  Telegram-specific; agent multi-select is deferred.

### New user capability mappings

| Telegram command | Agent capability |
|---|---|
| `/help`, `/flow` | `get_agent_guide` |
| `/league_changes` | `get_league_changes` |
| `/league_graphs` | `get_league_graph` |
| `/race_summary` | `get_race_summary` |
| `/whats_new` | `get_whats_new` |
| `/get_current_simulation` | `get_simulation_status` |
| `/load_simulation` | `load_latest_simulation` |
| `/print_cache` | `get_data_status` |
| `/reset_cache` | `reset_user_data` |

### New admin capability mappings

| Telegram command | Admin-only agent tool |
|---|---|
| `/version` | `get_admin_version` |
| `/billing_stats` | `get_billing_stats` |
| `/list_users` | `list_bot_users` |
| `/list_web_users` | `list_web_users` |
| `/get_botfather_commands` | `get_botfather_setup` |
| `/set_nickname` | `set_user_nickname` |
| `/allow_web_user` | `allow_web_user` |
| `/revoke_web_user` | `revoke_web_user` |
| `/send_message_to_user` | `send_user_message` |
| `/broadcast` | `broadcast_message` |
| `/trigger_scraping` | `trigger_scraping` |
| `/trigger_api_data` | `trigger_api_data` |
| `/trigger_api_data_locked` | `trigger_api_data_locked` |
| `/trigger_next_race_info` | `trigger_next_race_info` |
| `/trigger_live_score_scheduler` | `trigger_live_score_scheduler` |

### Explicit exceptions

- `/menu`: Telegram navigation construct; natural-language chat has no menu.
- `/start`: Telegram lifecycle entry point; web sign-in/guide owns onboarding.
- `/upload_drivers_photo`: permanently Telegram-only.
- `/upload_constructors_photo`: permanently Telegram-only.

## Cross-cutting architecture

### Capability manifest and CI parity enforcement

Add one source-of-truth capability manifest with one row per
`COMMAND_*` constant:

- command constant and audience (`user` or `admin`)
- Telegram handler
- agent status: `implemented`, `adapted`, `planned`, or `excluded`
- agent tool name or names
- explicit rationale for adapted/excluded commands
- confirmation, admin, and file-input requirements

Automated tests must:

- discover every exported `COMMAND_*` constant and require exactly one manifest
  row
- verify every command maps to `COMMAND_HANDLERS`
- verify every `implemented`/`adapted` agent tool exists in the registered tool
  catalogue
- verify admin mappings use the central admin wrapper
- reject an exception without a non-empty rationale
- reject new `planned` entries after the final parity-closure PR
- detect agent tools missing from the manifest or an agent-native supporting
  capability list

This makes "new Telegram command requires an agent decision" a CI rule rather
than a documentation convention.

### Shared admin authorization

- Extract `isAdminChatId(chatId)` as the shared predicate.
- Keep `isAdminMessage(msg)` as a Telegram adapter over that predicate.
- Add `requireAgentAdmin()`, `defineAdminReadTool()`, and
  `defineAdminWriteTool()` helpers.
- Resolve chatId only from authenticated request context; never accept chatId,
  email, or admin flags from model-controlled arguments.
- Non-admin execution returns a localized `forbidden` envelope and performs no
  downstream call.
- Log successful and denied admin operations with actor identity and safe
  target metadata.
- Admin write tools still use staged intents and authenticated confirmation.

The static CopilotKit runtime may register admin schemas for every authenticated
user. Server-side authorization is mandatory and sufficient to prevent
execution. Request-scoped hiding may be added only if it does not require
rebuilding the cached runtime for every request; it is defense in depth, not
the authorization boundary.

### Shared capability pattern

- Read capabilities: pure structured core -> unchanged Telegram adapter ->
  wrapped agent read tool -> localized rich renderer.
- Write capabilities: effectful shared service -> unchanged Telegram adapter ->
  `defineWriteTool` proposal/commit -> authenticated confirmation.
- Direct picker controls may propose canonical targets, but may never approve
  or call a service directly.
- Every rich component supports saved English/Hebrew language, RTL, loading,
  empty, error, and accessibility states.
- Expected errors return status envelopes; raw Azure/HTTP errors stay in
  private error logs.

## Rollout phases

### Phase 1 — Parity contract and admin foundation (implemented)

- Add the capability manifest covering all 50 current Telegram commands.
- Mark existing parity, planned work, adapted Teams Tracker, and four explicit
  exclusions.
- Add manifest/registry CI tests.
- Extract `isAdminChatId` and add central agent admin wrappers.
- Prove existing Telegram admins succeed, authenticated non-admins are denied
  before side effects, and model-supplied identity fields are ignored.
- Update `AGENTS.md` so new-command instructions require manifest + bot + agent
  work in the same PR.

### Phase 2 — Agent Guide (`/help` + `/flow`) (implemented)

- Extract a shared structured capability/help model used by Telegram help/flow
  adapters and the agent.
- Add `get_agent_guide({ topic? })`.
- Return supported tasks grouped by intent, personalized prerequisites/next
  steps, natural-language examples, and admin guidance only for admins.
- Build a localized guide card. Do not make Telegram slash syntax the primary
  UX.

### Phase 3 — League changes (implemented)

- Extract raw comparison logic into `leagueChangesCore`; keep Telegram HTML in
  the adapter.
- Add `get_league_changes({ leagueCode })` with guided league selection.
- Build a localized per-team change component for transfers, captain,
  mega-captain, chip, new-team, no-change, mismatch, and missing-snapshot
  states.

### Phase 4 — League graphs (implemented)

- Extract shared series builders for gap-to-leader, standings, and budget.
- Keep QuickChart in the Telegram adapter.
- Add `get_league_graph({ leagueCode, graphType })`, guided league/type
  selection, and accessible localized web charts built from structured series.
- Preserve active-team highlighting, excluded-team filtering, chip markers,
  tied standings, missing budget points, and race-name mapping.

### Phase 5 — Race summary (implemented)

- Extract `raceSummaryCore` for source data and `raceSummaryService` for
  controlled text generation.
- Share source data, exclusion rules, prompt policy, language, and model between
  Telegram and agent.
- Add `get_race_summary({ leagueCode })` with guided selection and a localized
  recap card.
- Add explicit token/error telemetry and output-size controls for the nested
  model call.

### Phase 6 — Release announcements (implemented)

- Reuse `announcementsService` through a small read core.
- Refactor `/whats_new` to format the core result without Telegram drift.
- Add `get_whats_new()` and a localized announcement card.

### Phase 7 — Simulation and data diagnostics reads (implemented)

- Add `simulationStatusCore` for source, matchday, next-race relevance, available
  driver/constructor counts, and bounded allowlisted projection rows.
- Add `dataStatusCore` for an agent-safe summary of source, selected/owned teams,
  structured cached projections and rosters, simulation metadata, missing
  prerequisites, and next actions.
- Refactor `/get_current_simulation` and `/print_cache` to consume shared
  structures while preserving Telegram output.
- Add `get_simulation_status()` and `get_data_status()`.
- Return all web-agent diagnostic timestamps in the saved language and local
  `Asia/Jerusalem` time. Never expose raw cache JSON, credentials, storage
  paths, or internal table entities.

### Phase 8 — Load latest simulation (implemented)

- Extract `simulationRefreshService` from `loadSimulationData`.
- Keep `/load_simulation` as a thin adapter.
- Add confirmed `load_latest_simulation()`.
- Serialize concurrent refreshes and return source/fetchedAt/matchday/counts.
- State clearly that each Function process refreshes its own cache from the
  same durable Blob source.

### Phase 9 — Confirmed user-data reset (implemented)

- Extract a bot-free, port-injected `resetUserDataService`.
- Add confirmed `reset_user_data()`.
- Warn precisely about team blobs, selected team, per-team preferences, and
  chat-specific projection overrides.
- Introduce a durable per-user reset/cache epoch so Telegram and agent processes
  invalidate stale user-specific caches.
- Reuse mutation leases, hydration, ETag CAS, snapshot compensation, and
  persist-before-cache publication.

### Phase 10 — Admin read tools (merged in PR #241)

Add centrally guarded:

- `get_admin_version`
- `get_billing_stats`
- `list_bot_users`
- `list_web_users`
- `get_botfather_setup`

Extract reusable structured cores/view models, preserve Telegram formatting,
add localized tables/cards and safe result caps, and prove non-admin requests
make zero backend calls.

### Phase 11 — Admin identity/access writes (merged in PR #242)

Add centrally guarded confirmed tools:

- `set_user_nickname`
- `allow_web_user`
- `revoke_web_user`

Extract shared services from pending-reply handlers. Use guided targets,
normalized exact email handling, previews, no-op detection, and audit logs.

### Phase 12 — Admin messaging (merged in PR #243)

Add centrally guarded confirmed tools:

- `send_user_message`
- `broadcast_message`

Use guided recipient selection, text-only agent input, previews, size
validation/chunking, fresh recipient/audience checks, a broadcast count warning,
safe sent/failed results, and actor/target correlation logging. Preserve
Telegram's text/image flow.

### Phase 13 — Admin manual triggers (in progress)

Add five separate centrally guarded confirmed tools:

- `trigger_scraping`
- `trigger_api_data`
- `trigger_api_data_locked`
- `trigger_next_race_info`
- `trigger_live_score_scheduler`

Each delegates to `manualTriggerService`, has an impact-specific confirmation,
uses a durable job-specific deduplication/lease boundary, and returns a visible
run/result reference without exposing raw service errors.

### Phase 14 — Parity closure

- Resolve all manifest `planned` entries.
- Add a CI assertion that no `planned` statuses remain.
- Generate the final report: all 50 commands classified, 45 commands with full
  mappings, Teams Tracker adapted, and four explicit exclusions.
- Update documentation/tool catalogues and run the complete bot/agent smoke
  matrix.

## Acceptance gates for every phase

- Existing Telegram behavior remains green; intentional behavior changes need
  explicit requirements and tests.
- New core/service and adapter/tool tests.
- Every agent execution uses `wrapToolExecute`.
- Admin tools deny non-admins before any effect.
- Writes cover proposal, approval, cancel/revoke, single-use consume,
  commit-time revalidation, no-op, and error paths.
- Targeted tests plus full `npm test`.
- Web tests and production build for UI work.
- Lint has zero new errors or warnings.
- `git diff --check`.
- English/Hebrew browser verification for new rich components.
- Test-slot verification after deployment.
- Cross-surface read-back for shared mutations.
- No test mutation remains persisted.

## Dependencies

- Phase 1 blocks all later phases.
- Phases 2-7 are otherwise read-oriented but ship sequentially because there is
  one fixed test Static Web App.
- Phase 8 depends on Phase 7.
- Phase 11 depends on Phase 10 for guided target selection.
- Phase 12 depends on Phase 10 for the recipient directory.
- Phase 14 depends on all earlier phases.

## Key risks

- Graphs must share data series, not QuickChart rendering.
- Race summary performs a model call inside a tool and requires explicit usage
  telemetry.
- Reset is the highest-risk user write because Telegram and agent have separate
  process caches; it cannot ship without durable epoch invalidation.
- Billing, user directories, allowlists, messages, and trigger results are
  sensitive and must never persist raw technical errors in chat history.
- General browser file uploads are out of scope. Projection-image commands
  remain permanent Telegram-only manifest exceptions.
