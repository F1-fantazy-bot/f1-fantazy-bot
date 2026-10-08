# Chat card refresh audit

PR #265 covers all 52 registered backend tools. The display cache previously
excluded admin cards, choices, confirmations, write receipts, league lists, and
many status-free or unsuccessful read results. Each tool now has an explicit
refresh policy in `web/src/lib/toolHistoryPolicy.json`.

## Recovery behavior

- Cards stay under the original user-message ID; repeated identical prompts each
  keep their own cards. Native live results suppress recovered duplicates.
- Read and admin cards retain their original result, language, and renderer.
  Empty, unavailable, prerequisite, clarification, selection, and friendly error
  states also persist. Silent workflow discovery remains invisible.
- Confirmations retain pending or settled decisions. Refresh during a submission
  shows an interrupted-outcome explanation and disables retry until its status
  can be checked. Refresh never approves, executes, or reruns a tool.
- Interactive team/league controls and the missing-league report button remain
  available. Fresh clicks continue through authenticated endpoints and existing
  server-side nonce ownership, expiration, approval, and single-use checks.
- Direct UI proposals and receipts are saved even though they do not appear in
  agent messages. Successful direct selection/removal updates the parent list
  snapshot. Recovered receipts do not replay global language or selection effects.
- Successful workflow cards continue recovering current state from the server,
  with the existing workflow prompt index. Workflow failures and choices use the
  display cache; requests without a result show an interrupted-request message.
- Only user/assistant text enters restored agent context. Tool results, calls,
  arguments, nonces, and cached decisions stay in the display layer. Cache data
  does not authorize a server operation.

## Verification

- Frontend: **385 tests passed across 34 files** (`npm --prefix web test`).
  The new coverage suite compares the actual backend tool registry against the
  policy map, representative fixtures, and read renderers. Adding a tool without
  refresh coverage fails the test. It also covers all tool-error envelopes,
  write confirmations, settled decisions, status-free results, empty/unavailable
  variants, direct receipts, interrupted calls, large UTF-8 results, and keeping
  snapshots out of model context.
- Backend: **1,642 tests passed across 183 suites** (`npm test -- --runInBand`).
- Production build: passed (`npm --prefix web run build`).
- Playwright: all **52 tools** were seeded with representative results and
  checked through **two mobile refreshes**, with two identical Hebrew prompts
  carrying separate card IDs. Successful workflows used mocked durable recovery.
  An additional **17** pending/cancelled/interrupted confirmation, selection,
  error, empty, and unavailable cases passed the same repeated-refresh checks.
  There were no duplicate cards, browser errors, automatic writes, approvals,
  or agent runs caused by refresh.
- Additional Playwright checks verified that the missing-league report button
  persists without filing a report, and exercised restored team selection through
  proposal → pending approval → refresh → explicit confirmation → receipt → two
  refreshes, preserving the selected-team highlight and avoiding duplicate dialogs.

The browser checks use mocked backend responses; they verify frontend recovery
and explicit interaction, rather than executing real administrative operations.

## Manual review prompts

Ask each prompt, refresh twice, and compare cards, team names, selection,
positions, and buttons. Repeat a prompt before refreshing to check both turns.

- “מי הקבוצות שאני עוקב אחריהן” — followed teams, positions, and active team.
- “הצג את הקבוצות שלי” — tracked teams and selection controls.
- “הצג את הליגות שלי” — league cards and league-selection controls.
- “מידע על המרוץ הבא” — race information.
- “הצג גרף של הליגה שלי” — graph and any league/type choice cards.
- “מה אתה יכול לעשות?” — guide and action choices.
- With an administrator account: “הצג את גרסת המערכת” — admin read card.

For a write you intend to make, refresh its pending approval before deciding.
After cancellation or completion, refresh again and confirm that the settled
card remains settled. A refresh must never perform the write itself.

## Retention and rollout limits

Conversation text retains the existing 20-message, 100 KB total, 8 KB/message
limits. Display snapshots retain at most 200 cards and 2 MiB, and only stay while
their originating prompt remains in retained text history. Storage is scoped to
the signed-in account; clear history and sign-out remove it. Browser storage
restrictions or quota failures can prevent persistence. Workflows retain their
existing server recovery and history-reset behavior.

Results discarded before this fix cannot be reconstructed from text; request
those cards again after deployment. Saved approvals still expire according to
the existing server policy.

## Complete tool inventory

| Tool | Refresh policy |
| --- | --- |
| `get_action_choices` | choices |
| `get_next_races` | read |
| `list_user_teams` | read |
| `get_best_teams` | read |
| `get_best_team_changes` | read |
| `get_best_team_scenarios` | read |
| `list_followed_teams` | read |
| `list_user_leagues` | read |
| `get_leaderboard` | read |
| `get_agent_guide` | read |
| `get_league_changes` | read |
| `get_league_graph` | read |
| `get_race_summary` | read |
| `get_whats_new` | read |
| `get_simulation_status` | read |
| `get_data_status` | read |
| `get_language` | read |
| `get_admin_version` | read |
| `get_billing_stats` | read |
| `list_bot_users` | read |
| `list_web_users` | read |
| `get_botfather_setup` | read |
| `get_next_race_info` | read |
| `get_race_weather` | read |
| `get_deadline` | read |
| `get_current_team` | read |
| `list_league_teams` | read |
| `get_live_score_for_team` | read |
| `get_live_score_leaderboard` | read |
| `set_language` | write |
| `select_team` | write |
| `set_best_team_ranking` | write |
| `activate_chip` | write |
| `follow_league` | write |
| `unfollow_league` | write |
| `follow_team` | write |
| `report_bug` | write |
| `load_latest_simulation` | write |
| `reset_user_data` | write |
| `set_user_nickname` | write |
| `allow_web_user` | write |
| `revoke_web_user` | write |
| `send_user_message` | write |
| `broadcast_message` | write |
| `trigger_scraping` | write |
| `trigger_api_data` | write |
| `trigger_api_data_locked` | write |
| `trigger_next_race_info` | write |
| `trigger_live_score_scheduler` | write |
| `confirm_write` | write |
| `propose_workflow` | workflow |
| `get_workflow_status` | workflow |
