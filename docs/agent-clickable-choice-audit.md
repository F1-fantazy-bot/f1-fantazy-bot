# Agent clickable-choice audit

All finite clarification questions must render an interactive choice in the
same turn. Read-only lists are not substitutes for action-aware pickers.
Free text remains appropriate for a new share code/email, nickname, message,
bug-report body, or an unknown name for which no candidates are available.

## Catalogue coverage

| Tools | Selection behavior |
| --- | --- |
| `get_live_score_for_team` | Missing league returns followed-league cards; after selection, use the saved team. An unavailable team returns authorized locked-roster team cards. Explicit team requests survive league selection. |
| `get_live_score_leaderboard`, `get_leaderboard` | Missing league returns clickable followed-league cards directly. |
| `get_current_team`, `get_best_teams`, `get_best_team_scenarios` | Use the selected team normally. Unknown/ambiguous targets return team cards that continue the same read, without changing active-team preferences. |
| `get_action_choices` | Account-backed team/league choices; shared chip/ranking presets; language and sort-order choices; cached driver/constructor filters. Preserves prior arguments and restricts continuation actions to an allowlist. |
| `list_user_teams`, `select_team` | Existing switch controls stage a canonical target for confirmation. Invalid named targets also render validated team candidates. |
| `list_followed_teams`, `follow_team` | Existing `unfollow_team` mode removes an explicitly selected tracked team. Add flow uses `list_user_leagues` then `list_league_teams` with `follow_team` mode and canonical IDs. Invalid targets reopen these pickers. |
| `list_user_leagues`, `unfollow_league` | Existing `unfollow_league` mode provides canonical removal controls. Ordinary list requests remain read-only. |
| `list_league_teams` | Existing follow controls use fresh planning rosters. A read without a league now returns league cards. Live-score target selection uses the locked roster through the action-choice path. |
| `get_league_changes`, `get_race_summary` | Existing canonical league cards. |
| `get_league_graph` | Existing canonical league and graph-type cards. |
| `set_language`, `get_language` | Unspecified changes use language cards; a question about the saved language stays read-only. |
| `set_best_team_ranking`, `activate_chip` | Missing preset/chip uses shared choice discovery. Omitted team uses the selected team. Invalid teams/presets/chips render validated candidates with the prior choice preserved. Selection still requires the normal confirmation card. |
| `list_bot_users`, `set_user_nickname`, `allow_web_user`, `send_user_message` | Existing admin-only directory selection modes carry canonical recipients and any pending text. They can select a target before new text/email is supplied. |
| `list_web_users`, `revoke_web_user` | Existing admin-only clickable email targets. |
| `get_agent_guide` | Existing contextual task cards cover feature/intent choices; admin tasks remain server filtered. |
| `get_next_races`, `get_next_race_info`, `get_race_weather`, `get_deadline`, `get_whats_new`, `get_simulation_status`, `get_data_status` | No required finite clarification inputs. Return the requested read directly. |
| `get_admin_version`, `get_billing_stats`, `get_botfather_setup` | Admin-only reads with no finite clarification inputs. |
| `follow_league`, `report_bug`, `broadcast_message` | Collect open-ended new share code or message text if missing, then show the existing confirmation card. |
| `load_latest_simulation`, `reset_user_data` | Existing explicit action confirmation; no target picker needed. |
| `trigger_scraping`, `trigger_api_data`, `trigger_api_data_locked`, `trigger_next_race_info`, `trigger_live_score_scheduler` | Each named workflow has its own existing confirmation. An unspecified administrative workflow routes to the clickable admin guide. |
| `confirm_write` | Existing authenticated Yes/Cancel flow. Choice clicks never approve or call this dispatcher. |

## Verification

- Backend tests exercise missing/ambiguous targets, account isolation, locked
  roster selection, preserved filters, selected-team defaults, safe errors,
  supported presets/languages, and rejection of identity/approval arguments.
- Web tests exercise English/Hebrew and RTL, canonical continuation, shared
  locking, rollback/retry, empty/busy states, and write-candidate rendering.
- Visible Chrome smoke uses the installed Playwright MCP server with isolated
  fixtures and the actual registered React renderers. It verifies English and
  Hebrew, desktop/mobile, keyboard selection, read continuation, and writes
  stopping at the actual confirmation component. The agent runner is mocked:
  this does not claim a live Azure model routing or deployed-site test.
- Telegram behavior and `src/agent/runtime.js` are unchanged. Parallel tool
  calls remain disabled.
