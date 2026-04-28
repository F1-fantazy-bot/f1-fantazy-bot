# F1 Fantasy Bot – Agent Handbook

This repository contains a Telegram bot that helps manage F1 Fantasy teams. The codebase is Node.js/JavaScript, heavily tested with Jest, and organized around command handlers that power Telegram commands, natural-language prompts, and inline menus.

---

## Core Concepts

- **Entry Point:** `src/bot.js` bootstraps the Telegram bot, initializes caches via Azure Storage, and registers message/callback listeners. It exports both the bot instance and a `cacheReady` promise. The Azure Function webhook (`telegramWebhook/index.js`) awaits `cacheReady` before processing any update, preventing a race condition where the first cold-start message would be handled before caches are populated.
- **Message Flow:**
  - `src/messageHandler.js` distinguishes between text, photo, and other message types. It also checks for pending replies (see Pending Reply Manager below) before routing to type-specific handlers.
  - `src/textMessageHandler.js` routes command strings to handler functions defined in `src/commandsHandler`.
  - Generic command execution is centralized in `src/commandsHandler/commandHandlers.js`, which maps command constants to handler implementations.
- **Pending Reply Manager:** `src/pendingReplyManager.js` provides a centralized mechanism for commands that need a follow-up reply from the user (text or photo). State is stored in **Azure Table Storage** for multi-server support. The check happens in `messageHandler.js` **before** the text/photo branching, so reply handlers receive the full message regardless of type. Supports optional `data` parameter for multi-step commands that need to store intermediate state between steps. **Global cancel:** `messageHandler.js` intercepts `/cancel`, `cancel`, or `ביטול` (case-insensitive) while any pending reply is active — it clears the entry and confirms with `t('Operation cancelled.')`. This works for every command registered in the pending-reply registry without any per-command changes.
- **Pending Reply Registry:** `src/pendingReplyRegistry.js` maps command identifiers (e.g., `'report_bug'`, `'send_message_to_user'`, `'set_nickname'`) to builder functions that reconstruct handlers, validators, and prompts. This enables serializable storage — only the command ID and optional data are persisted, and the full behavior is rebuilt on any server instance. Builder functions receive `(chatId, data)` where `data` is optional stored state for multi-step commands.
- **Caching:** `src/cache.js` holds in-memory data for drivers, constructors, current team info, simulations, next race info, weather forecasts, a cached remaining-race count, and a unified `userCache`. Team-related caches (`currentTeamCache`, `bestTeamsCache`, `selectedChipCache`) are **nested by team ID** — see the [Multi-Team System](#multi-team-system) section below. `src/cacheInitializer.js` populates those caches on startup — most data comes from Azure Blob Storage (with team-aware blob naming), while `userCache` is populated from the `UserRegistry` Azure Table via a single `listAllUsers()` call. Each entry in `userCache` is keyed by `chatId` and holds `{ lang, nickname, chatName, selectedTeam, ... }`.
- **Display Names:** `src/utils/utils.js` provides `getDisplayName(chatId)` which checks the in-memory `userCache` and returns the nickname if set, then falls back to `chatName`, then to the stringified `chatId`. This is used in `messageHandler.js` for all log messages so admins see nicknames in logs instead of Telegram display names.
- **User Registry:** `src/userRegistryService.js` tracks all users who interact with the bot in an Azure Table Storage table (`UserRegistry`). On every allowed message, `messageHandler.js` calls `upsertUser(chatId, chatName)` in a fire-and-forget manner (no `await`) so that registry failures never block message handling. The `/list_users` admin command (`src/commandsHandler/listUsersHandler.js`) displays all registered users with their details, including nicknames when set.
- **Utilities & Services:**
  - `src/utils` contains Telegram helpers, formatting (`formatDateTime`), display name resolution (`getDisplayName`), and logging utilities.
  - **Logging:** `sendLogMessage(bot, message)` sends informational messages to `LOG_CHANNEL_ID`. `sendErrorMessage(bot, message)` sends error messages to **both** `LOG_CHANNEL_ID` and `ERRORS_CHANNEL_ID` — use it wherever an error, failure, or exception is being reported. Both constants are defined in `src/constants.js`.
  - `src/utils/weatherApi.js` interacts with external weather services.
  - `src/azureStorageService.js` and `src/azureBillingService.js` wrap Azure integrations.
- **Internationalization:** `src/i18n.js` and `src/translations.js` provide language support (English/Hebrew) used throughout handlers.
- **AI Assist:** `src/prompts.js` defines system prompts. `/ask`-style natural language queries are handled by `src/commandsHandler/askHandler.js`, which leverages Azure OpenAI to map free-text requests into command sequences.

---

## Command Architecture

1. **Constants:** `src/constants.js` defines Telegram command strings (`/best_teams`, `/next_races`, etc.), menu structures, and admin/user command configs.
2. **Handlers:** Each command lives in `src/commandsHandler`. Examples:
   - `nextRaceInfoHandler.js` – detailed next race info.
   - `nextRaceWeatherHandler.js` – weather forecasts.
   - `nextRacesHandler.js` – upcoming race schedule (new `/next_races`).
   - `deadlineHandler.js` – next fantasy lock deadline countdown with refresh callback (`/deadline`).
   - `selectTeamHandler.js` – switch between multiple teams.
   - `setBestTeamRankingHandler.js` – choose how expected budget changes influence best-team ranking.
   - `setNicknameHandler.js` – admin command to set user nicknames.
3. **Exports:** `src/commandsHandler/index.js` re-exports all handler functions for convenient imports elsewhere.
4. **Command Router:** `src/commandsHandler/commandHandlers.js` maps constants to handler functions and implements `executeCommand` used by the ASK agent and menu callbacks.
5. **Text Routing:** `src/textMessageHandler.js` checks incoming text and dispatches to the appropriate handler; non-command text is parsed as JSON or delegated to the ASK agent.
6. **Natural Language Prompt:** `src/prompts.js` exports `buildAskSystemPrompt(isAdmin)`, which dynamically builds the command allowlist for the ASK agent. The allowed commands are derived from `MENU_CATEGORIES` in `src/constants.js` (single source of truth) — user commands come from non-admin categories, admin commands from `adminOnly` categories. A small `EXTRA_ASK_COMMANDS` array covers chip sub-commands (`/extra_boost`, `/limitless`, `/wildcard`, `/reset_chip`) that aren't in any menu category but should be discoverable via free text. The `askHandler.js` checks `isAdminMessage(msg)` before building the prompt, so admin commands are only included for admin users. When adding a new command, simply adding it to `MENU_CATEGORIES` in `constants.js` is sufficient — it will automatically appear in the ASK prompt.
7. **Menu/Help:** `src/commandsHandler/menuHandler.js` and `helpHandler.js` build structured menus using the definitions in `constants.js`.

---

## Tests

- Jest-based tests live alongside source files (e.g., `src/commandsHandler/nextRacesHandler.test.js`).
- Run `npm test` to execute the full suite.
- Many tests use console error logging to validate error-path behavior; expect noisy output during normal test runs.

---

## Key Commands (User-Facing)

- `/best_teams`, `/best_team_scenarios`, `/current_team_info`, `/chips`, `/extra_boost`, `/limitless`, `/wildcard`, `/reset_chip`
- `/set_best_team_ranking`
- `/select_team`, `/print_cache`, `/reset_cache`
- `/next_race_info`, `/next_races`, `/next_race_weather`, `/deadline`
- `/get_current_simulation`
- `/load_simulation`
- `/menu`, `/help`, `/lang`
- `/follow_league`, `/unfollow_league`, `/teams_tracker`, `/leaderboard`, `/league_graphs`
- `/report_bug` _(reply-based — uses pending reply manager)_

**Admin-only:** `/trigger_scraping`, `/get_botfather_commands`, `/billing_stats`, `/version`, `/list_users`, `/send_message_to_user`, `/broadcast`, `/set_nickname`, `/live_score`, `/upload_drivers_photo`, `/upload_constructors_photo`, `/whats_new`

### Announcements file (`/whats_new`)

`data/announcements.json` is a committed array of release-announcement entries (newest first). The `release-announcement` skill **writes** to it (after the admin picks Standard/WOW); `src/announcementsService.js` **reads** it and `src/commandsHandler/whatsNewHandler.js` exposes the latest entry via the admin-only `/whats_new` command. Each entry has shape `{ id, createdAt, version: 'standard'|'wow', sinceRef, headCommit, text }` where `text` is the Hebrew Markdown body **without** the `### 📋`/`### 🔥` title line, fence wrappers, or backticks around `/commands`. The handler sends `text` with `parse_mode: 'Markdown'` (with plain-text fallback on parse errors) and escapes underscores inside `/command` tokens at send time so Telegram auto-links them instead of consuming the underscore as an italic marker. Missing or malformed file → handler shows a localized "no announcements yet" message and the skill treats it as `[]`.

---

## Environment & Deployment

Required environment variables (see `readme.md` for full list):

- Telegram: `TELEGRAM_BOT_TOKEN`
- Azure OpenAI: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPEN_AI_MODEL`
- Azure Storage: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`
  - **Note:** `AZURE_STORAGE_CONNECTION_STRING` is also used by the Pending Reply Manager and User Registry Service for Azure Table Storage (no additional env var needed).
- Optional billing data: `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- Scraping trigger: `AZURE_LOGICAPP_TRIGGER_URL`

Start the bot with `npm start` (polling in dev) or configure webhook as needed for production.

**Cold-Start Initialization:** `src/bot.js` stores the `initializeCaches()` promise as `cacheReady` and exports it. The Azure Function webhook (`telegramWebhook/index.js`) awaits `bot.cacheReady` before calling `bot.processUpdate(update)`. On a cold start the first request waits for caches to be ready; on warm invocations the resolved promise returns instantly. In polling dev mode `cacheReady` is unused — the natural polling delay avoids the race.

---

## Adding a New Command

Use this as a checklist when introducing another Telegram command:

1. **Define the Command Constant**
   - Add the new command string to `src/constants.js` alongside existing `COMMAND_*` exports.
   - If the command should appear in menus or BotFather lists, update the relevant section in `MENU_CATEGORIES` and ensure it will propagate via `USER_COMMANDS_CONFIG`/`ADMIN_COMMANDS_CONFIG`.
   - Provide translations in `src/translations.js` for command titles/descriptions and any new message text.

2. **Implement the Handler**
   - Create a handler file in `src/commandsHandler` (or update an existing one if extending behavior).
   - Export the handler function from `src/commandsHandler/index.js`.
   - If the handler requires shared utilities (fetching, formatting, logging), leverage helpers from `src/utils` and consider caching results when appropriate.

3. **Register the Handler**
   - Add the handler import and mapping entry in `src/commandsHandler/commandHandlers.js`.
   - Update the `executeCommand` switch if the handler signature matches other specialized cases (e.g., commands that expect `(bot, chatId)` vs `(bot, msg)`).
   - Update `src/textMessageHandler.js` to route the literal command string to your new handler.

4. **Natural Language Support**
   - Commands added to `MENU_CATEGORIES` in `src/constants.js` are **automatically** included in the ASK prompt — no additional changes needed.
   - Admin commands (in `adminOnly` categories) are only exposed to admin users via the ASK agent.
   - If adding a command that is **not** in any menu category but should be discoverable via free text, add it to the `EXTRA_ASK_COMMANDS` array in `src/prompts.js`.

5. **Testing**
   - Create a Jest test for the new handler (place alongside the handler as `*.test.js`). Mock external calls/fetches as needed.
   - Update `src/textMessageHandler.test.js` (and/or `menuHandler.test.js`, etc.) to ensure the command is routed correctly.
   - Run `npm test` to confirm the suite passes.

6. **Documentation & Menu**
   - If the command surfaces in help/menu outputs, ensure the text reads well in both English and Hebrew.
   - Update `readme.md` or other docs if the new command is user-visible.

7. **Deployment Notes**
   - Verify any new environment variables or external APIs are available in production.
   - If the command interacts with caches, confirm `cacheInitializer` populates or resets data correctly.

Following this sequence keeps the bot's command catalogue consistent across direct commands, menus, and natural-language interactions.

---

## Adding a Reply-Based Command

Some commands need a follow-up reply from the user (text or photo) before completing their action.
These use the **Pending Reply Manager** (`src/pendingReplyManager.js`) backed by **Azure Table Storage** for multi-server support, with the **Pending Reply Registry** (`src/pendingReplyRegistry.js`) providing the handler/validation logic.

### Architecture

The system uses a **command ID pattern** instead of storing functions directly:

- **Registration:** The command handler stores a command ID string (e.g., `'report_bug'`) in Azure Table Storage via `registerPendingReply(chatId, commandId)`. An optional `data` object can be stored for multi-step commands via `registerPendingReply(chatId, commandId, data)`.
- **Resolution:** When a reply arrives, `messageHandler.js` retrieves the command ID (and data, if any) from Table Storage and resolves it via the registry (`src/pendingReplyRegistry.js`) to reconstruct the handler, validator, and resend prompt.
- **Multi-server:** Since only serializable data (command ID + chatId + optional data JSON) is stored externally, any server instance can handle the reply.

### How It Works

1. When a command is triggered, it calls `await registerPendingReply(chatId, 'command_id')` (or `await registerPendingReply(chatId, 'command_id', { step: 'step_name' })` for multi-step commands) to store the command ID in Azure Table Storage.
2. On the user's next message (any type), `messageHandler.js` calls `await getPendingReply(chatId)` — a single Table Storage read that also resolves the command via the registry:
   - If a `validate` function was provided and it returns `false` for the message, the `resendPromptIfNotValid` is re-sent (with `force_reply`) and the pending reply stays active — the user can try again. If no `resendPromptIfNotValid` was provided, a default `"Invalid reply. Please try again."` message is used.
   - Otherwise, `await clearPendingReply(chatId)` removes the entry from Table Storage and the handler is executed with the reply.
3. The handler receives the full `(bot, msg)` — it can inspect `msg.text`, `msg.photo`, or any other field.
4. Entries older than 1 hour are automatically treated as expired (TTL check on read).

### Checklist for a New Reply-Based Command

Follow the standard "Adding a New Command" steps above, **plus** these specifics:

1. **Register the command in the Pending Reply Registry** (`src/pendingReplyRegistry.js`):

   ```javascript
   // In PENDING_REPLY_REGISTRY object:
   my_command: {
     buildHandler: (chatId, data) => async (replyBot, replyMsg) => {
       // Process the reply. data is null for single-step commands.
     },
     buildValidate: () => (replyMsg) => !!replyMsg.text,    // only accept text replies
     buildResendPrompt: (chatId, data) => t('Please try again', chatId),
   },
   ```

   The `buildValidate` and `buildResendPrompt` are optional. If omitted, any message type is accepted (no validation). When `buildValidate` is provided but `buildResendPrompt` is not, a default message is used. All builder functions receive `(chatId, data)` — single-step commands can ignore the `data` parameter.

2. **Call `registerPendingReply` in your handler** with the command ID (and optional data):

   ```javascript
   const { registerPendingReply } = require('../pendingReplyManager');

   async function handleMyCommand(bot, msg) {
     const chatId = msg.chat.id;
     const prompt = t('Please send your response:', chatId);

     await registerPendingReply(chatId, 'my_command');
     // Or for multi-step: await registerPendingReply(chatId, 'my_command', { step: 'step_1' });

     await bot.sendMessage(chatId, prompt, {
       reply_markup: { force_reply: true },
     });
   }
   ```

3. **No changes needed** in `messageHandler.js`, `textMessageHandler.js`, or `commandsHandler/index.js` for the reply interception — the generic `getPendingReply/clearPendingReply` check handles everything.

4. **Testing:**
   - **Handler test:** Mock `../pendingReplyManager` and verify the command ID is passed:

     ```javascript
     jest.mock('../pendingReplyManager', () => ({
       registerPendingReply: jest.fn().mockResolvedValue(),
     }));
     const { registerPendingReply } = require('../pendingReplyManager');

     // After calling the command handler:
     expect(registerPendingReply).toHaveBeenCalledWith(chatId, 'my_command');
     ```

   - **Registry test:** Test the handler/validate/prompt builders in `src/pendingReplyRegistry.test.js`:
     ```javascript
     const { resolveCommand } = require('./pendingReplyRegistry');
     const resolved = resolveCommand('my_command', chatId);
     await resolved.handler(botMock, replyMsg);
     // Assert on behavior
     expect(resolved.validate({ text: 'hello' })).toBe(true);
     ```

### Existing Examples

- **Single-step:** See `src/commandsHandler/reportBugHandler.js` — the `/report_bug` command registers `'report_bug'` as a pending reply. The handler logic (sending to admins, validation for text-only) lives in `src/pendingReplyRegistry.js` under the `report_bug` entry.
- **Single-step (broadcast):** See `src/commandsHandler/broadcastHandler.js` — the `/broadcast` admin command registers `'broadcast'` as a pending reply. The handler in `src/pendingReplyRegistry.js` fetches all users via `listAllUsers()`, sends the broadcast message to each (localized per recipient), and reports a success/failure summary back to the admin.
- **Multi-step:** See `src/commandsHandler/sendMessageToUserHandler.js` — the `/send_message_to_user` admin command uses a two-step reply flow with intermediate data storage. Step 1 collects the target user's chat ID (validated against the User Registry), then re-registers with `{ step: 'collect_message', targetChatId }`. Step 2 collects the message text and sends it to the target user. The handler uses lazy `require` for `pendingReplyManager` to avoid circular dependencies.
- **Multi-step (set nickname):** See `src/commandsHandler/setNicknameHandler.js` — the `/set_nickname` admin command uses a two-step reply flow. Step 1 collects the target user's chat ID (validated against the User Registry), then re-registers with `{ step: 'collect_nickname', targetChatId, targetChatName }`. Step 2 collects the nickname text, stores it via `updateUserAttributes()`, updates the in-memory `userCache`, and confirms to the admin.

### API Reference

#### `src/pendingReplyManager.js` (Azure Table Storage backend)

All methods are **async** — they interact with Azure Table Storage. The table is created once per process lifetime (lazy initialization).

| Method                 | Signature                                                  | Purpose                                                                                                                     |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `registerPendingReply` | `registerPendingReply(chatId, commandId, data?) → Promise` | Store a pending reply command ID (and optional data as JSON) in Azure Table Storage                                         |
| `getPendingReply`      | `getPendingReply(chatId) → Promise<entry \| undefined>`    | Single Table Storage read → resolve command ID + data via registry; returns `{ handler, validate, resendPromptIfNotValid }` |
| `clearPendingReply`    | `clearPendingReply(chatId) → Promise`                      | Remove from storage without executing                                                                                       |

#### `src/pendingReplyRegistry.js` (Command → handler mapping)

| Export                   | Signature                                                  | Purpose                                                                                                               |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PENDING_REPLY_REGISTRY` | `Object`                                                   | Maps command ID strings to `{ buildHandler, buildValidate?, buildResendPrompt? }`. Builders receive `(chatId, data)`. |
| `resolveCommand`         | `resolveCommand(commandId, chatId, data?) → entry \| null` | Builds a full `{ handler, validate, resendPromptIfNotValid }` entry from a command ID and optional data               |

---

## User Registry

`src/userRegistryService.js` provides a lightweight user tracking system backed by **Azure Table Storage** (table: `UserRegistry`). It uses the same `AZURE_STORAGE_CONNECTION_STRING` as the rest of the app — no additional env vars needed.

### How It Works

1. On every incoming message from an allowed user, `messageHandler.js` calls `upsertUser(chatId, chatName)` **without `await`** (fire-and-forget).
2. `upsertUser` uses Azure Table Storage **Merge mode** — it only sends `chatName` and `lastSeen` (plus `firstSeen` for new users). All other existing attributes (lang, nickname, future fields) are automatically preserved by Merge mode without needing to read them first.
3. Errors are caught and logged silently (`console.error`) — the user registry never blocks or breaks message handling.
4. The `/list_users` admin command (`src/commandsHandler/listUsersHandler.js`) calls `listAllUsers()` to fetch all registered users. `listAllUsers()` automatically returns all non-system fields from each entity, so new attributes are included without code changes. Nicknames are displayed when present.
5. User attributes (e.g., language preferences, nicknames) are stored via `updateUserAttributes(chatId, { lang })` or `updateUserAttributes(chatId, { nickname })` — called by `setLanguageHandler.js`, `callbackQueryHandler.js`, and the `set_nickname` pending reply handler. This generic function uses Merge mode so it only writes the specified attributes without reading or overwriting others. On startup, `cacheInitializer.js` calls `listAllUsers()` once and populates the unified in-memory `userCache` with all user data (lang, nickname, chatName, etc.).

### Generic Merge Pattern

The service uses Azure Table Storage's **Merge mode** (`upsertEntity(entity, 'Merge')`) as its core pattern. This means:

- **`upsertUser`** only sends fields it owns (`chatName`, `lastSeen`, `firstSeen`) — all other attributes are untouched.
- **`updateUserAttributes`** only sends the provided key-value pairs — no read step needed, no risk of overwriting unrelated fields.
- **Adding a new attribute** requires only calling `updateUserAttributes(chatId, { newField: value })` — no changes to `upsertUser` or any existing code.
- **Race conditions are eliminated** — Merge mode is atomic for the fields being updated, unlike the old read-then-write pattern.

### Table Schema

The table is **extensible** — new attributes can be added at any time without schema changes. Known fields:

| Field          | Type     | Description                                                                                   |
| -------------- | -------- | --------------------------------------------------------------------------------------------- |
| `partitionKey` | `string` | Always `'User'`                                                                               |
| `rowKey`       | `string` | The `chatId` (stringified)                                                                    |
| `chatName`     | `string` | Display name from `getChatName(msg)`                                                          |
| `lang`         | `string` | Language code (`'en'`, `'he'`). Optional — absent means default (`'en'`).                     |
| `nickname`     | `string` | Admin-assigned display name for logs. Optional — when set, replaces `chatName` in log output. |
| `selectedTeam` | `string` | Currently selected team ID (`'T1'`, `'T2'`, etc.). Optional — absent means no team selected.  |
| `firstSeen`    | `string` | ISO timestamp — set on first interaction, preserved on updates                                |
| `lastSeen`     | `string` | ISO timestamp — updated on every message                                                      |

### API Reference

| Method                 | Signature                                            | Purpose                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upsertUser`           | `upsertUser(chatId, chatName) → Promise`             | Track a user interaction. Fire-and-forget — errors are logged, never thrown. Uses Merge mode to preserve all other fields.                                                                                        |
| `updateUserAttributes` | `updateUserAttributes(chatId, attributes) → Promise` | Update one or more user attributes using Merge mode. No read step needed. Example: `updateUserAttributes(chatId, { nickname: 'Max' })`.                                                                           |
| `getUserById`          | `getUserById(chatId) → Promise<Object\|null>`        | Point lookup for a single user by chat ID. Returns user object with all stored attributes, or `null` if not found. Throws on real storage errors. More efficient than `listAllUsers` when you only need one user. |
| `listAllUsers`         | `listAllUsers() → Promise<Array<Object>>`            | Return all registered users with all stored attributes. Automatically includes future fields. Used by `cacheInitializer` to populate `userCache` on startup.                                                      |

---

## League Registry

`src/leagueRegistryService.js` tracks league follows in an Azure Table Storage table (`UserLeagues`). Data is produced by the sibling repo `f1-fantasy-api-data`, which writes two blobs per league to Azure Blob Storage in the same container (`AZURE_STORAGE_CONTAINER_NAME`) used by the bot:

- `leagues/{leagueCode}/league-standings.json` — header + `teams: [{ teamName, userName, position, totalScore, raceScores, raceBudgets, chipsUsed }]`. Used by `/leaderboard` and `/league_graphs`.
- `leagues/{leagueCode}/teams-data.json` — header + `teams: [{ teamName, userName, position, budget, transfersRemaining, drivers, constructors }]` where each roster entry is `{ id, name, price, isCaptain, isMegaCaptain, isFinal }`. Used by `/teams_tracker` to load/manage followed team rosters from the league directly into the bot's cache.

### How It Works

1. Admin runs `/follow_league` → pending-reply flow prompts for the league code.
2. The `follow_league` registry entry calls `getLeagueData(code)` from `src/azureStorageService.js`. If the blob is missing, the flow re-registers itself and re-prompts so the admin can retry without typing the command again.
3. On success, `addUserLeague(chatId, leagueCode, leagueName)` stores a row in `UserLeagues` (partitionKey=chatId, rowKey=leagueCode) with the league name captured at follow time.
4. `/leaderboard` calls `listUserLeagues(chatId)`:
   - 0 leagues → prompt to run `/follow_league`.
   - 1 league → auto-fetch blob and render leaderboard.
   - 2+ leagues → inline keyboard (`LEAGUE_CALLBACK_TYPE`) showing each league by name; on selection, callback handler fetches the blob and renders.
5. `/unfollow_league` shows an inline keyboard (`LEAGUE_UNFOLLOW_CALLBACK_TYPE`) with all followed leagues; selection calls `removeUserLeague(chatId, leagueCode)`.
6. `/teams_tracker` (label `📋 Teams Tracker` / `📋 קבוצות במעקב`) opens a **multi-level inline-keyboard** to manage all followed teams in one place:
   - **League picker** (shown when the user follows >1 league) — one button per league with a count of currently-staged selections.
   - **Team toggle view** — each league's teams are rendered as `✅`/`⬜` toggle buttons. Selections are staged (not persisted) until **Save**. Hard cap: `MAX_FOLLOWED_LEAGUE_TEAMS = 6` across all leagues — attempting to toggle ON a 7th team triggers a `show_alert` popup and does not mutate state.
   - Bottom row: `💾 Save ({N}/{MAX})`, `✖ Cancel`, and `⬅ Back` (only when there are >1 leagues).
   Seeded from currently-followed teams on open, so toggles reflect today's state. Save/Cancel delete the session blob. League `teams-data.json` is fetched via `getLeagueTeamsData(leagueCode)` and cached in memory per leagueCode (`leagueTeamsDataCache`).

   **Session lifecycle.** The staging state is stored in Azure Blob Storage at `teams-tracker-sessions/{chatId}.json` with shape `{ chatId, messageId, currentView, currentLeagueCode, selected:[{leagueCode, position}], initiallyFollowed:[teamId], addOrder:[teamId], updatedAt }` and survives across servers. Every `TT:*` callback verifies `query.message.message_id === session.messageId` AND `now - updatedAt <= TEAMS_TRACKER_SESSION_TTL_MS` (30 min). Mismatch or expiry → `show_alert` "This Teams Tracker view has expired…" + delete session; do not mutate state. Reopening `/teams_tracker` overwrites any existing session (re-seeded) and best-effort-edits the old message with an "expired" notice.

   **Save logic (deterministic active-team resolution).** At save, each touched league's `teams-data.json` is re-fetched (drops stale positions with a `⚠️ {N} team(s) could not be added` warning). For the final set of followed teamIds: if previous `selectedTeam` still exists in the set → keep it; else first entry of `addOrder` still followed; else first remaining followed team; else clear. Cross-source rule: if save produces ≥1 league team, screenshot teams (`T1`/`T2`/`T3`) are wiped first via `ensureSourceIsLeague`. Persistence is a single `updateUserAttributes({ selectedTeam, selectedBestTeamByTeam })` call.

   **Callback types.** `TEAMS_TRACKER_CALLBACK_TYPE = 'TT'` with actions `TEAMS_TRACKER_ACTIONS = { OPEN_LEAGUE:'L', TOGGLE:'T', BACK:'B', SAVE:'S', CANCEL:'C' }`. Payload formats: `TT:L:{leagueCode}`, `TT:T:{leagueCode}:{position}`, `TT:B`, `TT:S`, `TT:C`. The short (2-char) type + single-char action names keep the worst-case payload (`TT:T:{leagueCode}_{position}`) well under Telegram's 64-byte `callback_data` limit.

   **Shared helpers.** The league-team read/write logic lives in `src/utils/leagueTeamHelpers.js` (`mapLeagueTeamToBotTeam`, `loadLeagueTeamsData`, `refreshLeagueTeamsData`, `followLeagueTeam`, `removeFollowedTeam`, `extractLeagueCode`, `buildLeagueNameMap`, `buildTeamLabel`). `followLeagueTeam` does **not** mutate `selectedTeam` — Teams Tracker save owns active-team resolution end-to-end. `removeFollowedTeam(chatId, teamId, { mutateSelectedTeam = true })` exposes a flag used by save to defer active-team mutation.
7. `/league_graphs` opens a two-step flow that renders per-league charts. Same 0/1/N league-selection flow as `/leaderboard` (callback type `LEAGUE_GRAPH_CALLBACK_TYPE`), followed by a graph-type picker (callback type `LEAGUE_GRAPH_TYPE_CALLBACK_TYPE`, payload `LEAGUE_GRAPH_TYPE:<gap|standings|budget>:<leagueCode>`). Three graph types are available:
   - **Gap to Leader** — line chart of each team's cumulative gap to the leader per race (leader sits on 0; everyone else is at or below 0). Chip usage is drawn as an emoji + chip-name label on the specific data point using the `chartjs-plugin-datalabels` plugin.
   - **Standings** — line chart of each team's **rank per race** computed from cumulative `raceScores` with competition-style ties (1, 2, 2, 4). Y-axis is reversed so rank 1 sits at the top, integer ticks with `stepSize: 1`, `min: 1`, `max: teams.length`. Legend is sorted by current-race rank ascending. Chip markers reuse the same emoji + chip-name datalabels pattern as Gap to Leader.
   - **Budget** — line chart of each team's **start-of-race budget** (`raceBudgets.matchday_N`, i.e. `maxTeambal` at the start of each race) per race. No chip annotations — clean lines only. Gaps in the data render as broken line segments (`spanGaps: true` + `null` values). Legend sorted by each team's most recent recorded budget, highest first (tie-break on `position`).

   Chart rendering is delegated to [`quickchart-js`](https://quickchart.io) — each handler builds a Chart.js config, calls `chart.getShortUrl()`, and sends the URL via `bot.sendPhoto` (Telegram fetches the PNG itself, no native `canvas` dep). X-axis labels use the short race name (e.g. `Chinese GP`) — `matchday_N` is mapped to round `N` in the current Jolpica/Ergast season schedule (`fetchCurrentSeasonRaces`) and `raceName` is shortened (`Grand Prix` → `GP`); falls back to `R{N}` if the mapping can't be resolved. Chip → emoji mapping lives in `src/utils/chipEmojis.js`. The shared color palette and `buildRoundToRaceNameMap`/`matchdayNumber`/`getSortedMatchdayKeys` helpers are exported from `leagueGraphHandler.js` and reused by `leagueBudgetGraphHandler.js` and `leagueStandingsGraphHandler.js`.

The leaderboard is rendered compactly (position, team name, total score) with a header showing league name, member count, and fetch time. Teams from the blob are already sorted by `position`.

### Table Schema

| Field          | Type     | Description                                         |
| -------------- | -------- | --------------------------------------------------- |
| `partitionKey` | `string` | The `chatId` (stringified)                          |
| `rowKey`       | `string` | The league code (e.g., `C8EFGOXCB04`)               |
| `leagueName`   | `string` | League display name captured when the user followed |
| `registeredAt` | `string` | ISO timestamp — set when the league was followed    |

### API Reference

| Method             | Signature                                                                          | Purpose                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `addUserLeague`    | `addUserLeague(chatId, leagueCode, leagueName) → Promise`                          | Upsert a league follow (Merge mode).                                                                |
| `removeUserLeague` | `removeUserLeague(chatId, leagueCode) → Promise`                                   | Delete a league follow. 404 is ignored (idempotent).                                                |
| `listUserLeagues`  | `listUserLeagues(chatId) → Promise<Array<{leagueCode, leagueName, registeredAt}>>` | Partition-scoped query returning all leagues a user follows.                                        |
| `getUserLeague`    | `getUserLeague(chatId, leagueCode) → Promise<Object\|null>`                        | Point lookup for a specific league follow.                                                          |
| `getLeagueData`       | `getLeagueData(leagueCode) → Promise<Object\|null>`                                | (in `azureStorageService.js`) Fetches `leagues/{code}/league-standings.json`. Returns `null` when the blob does not exist. |
| `getLeagueTeamsData`  | `getLeagueTeamsData(leagueCode) → Promise<Object\|null>`                           | (in `azureStorageService.js`) Fetches `leagues/{code}/teams-data.json` (per-team budget, transfers, roster). Returns `null` when the blob does not exist. |

---

## Nickname System

The nickname system allows admins to assign custom display names to users that replace the Telegram `chatName` in all bot log messages.

### How It Works

1. Admin runs `/set_nickname` → two-step reply flow collects target user chat ID, then the nickname text.
2. The nickname is stored in the `UserRegistry` Azure Table via `updateUserAttributes(chatId, { nickname })`.
3. The in-memory `userCache` (in `src/cache.js`) is updated immediately with the nickname field.
4. On startup, `cacheInitializer.js` loads all users via `listAllUsers()` into `userCache` — nicknames are included automatically.
5. `getDisplayName(chatId)` in `src/utils/utils.js` checks `userCache` — returns the nickname if set, falls back to `chatName`, then to the stringified `chatId`.
6. `messageHandler.js` calls `getDisplayName()` for all `sendLogMessage()` calls, so log messages show nicknames.
7. `/list_users` output shows the nickname (📛) when present for each user.

### Key Files

| File                                        | Role                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/cache.js`                              | `userCache` — in-memory `{ chatId: { lang, nickname, chatName, selectedTeam, ... } }` map  |
| `src/userRegistryService.js`                | `listAllUsers()` — loads all user data from Azure Table                                    |
| `src/cacheInitializer.js`                   | Populates `userCache` on startup via single `listAllUsers()` call                          |
| `src/utils/utils.js`                        | `getDisplayName(chatId)` — resolves nickname → chatName → chatId fallback                  |
| `src/messageHandler.js`                     | Uses `getDisplayName()` in all log messages; updates `userCache` chatName on every message |
| `src/commandsHandler/setNicknameHandler.js` | `/set_nickname` command handler (admin-only, two-step reply)                               |
| `src/pendingReplyRegistry.js`               | `set_nickname` entry — collects chat ID then nickname, stores, updates `userCache`         |
| `src/commandsHandler/listUsersHandler.js`   | Shows nickname in `/list_users` output                                                     |

---

## Multi-Team System

The bot supports **multiple teams per user**. Teams are keyed by a `teamId` string inside each chat's nested caches. Two `teamId` formats are in use:

- **Screenshot flow:** `T1`, `T2`, `T3` — extracted from the colored-square icon in the team photo by `EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT`.
- **League flow:** `{leagueCode}_{sanitizedTeamName}` — created via `/teams_tracker`. `sanitizedTeamName` strips unsafe characters (only word chars and `-` survive) and is truncated to 40 chars to keep the blob path (`user-teams/{chatId}_{teamId}.json`) and callback data short.

Picking a team from a league **adds it** to the user's followed league teams (up to `MAX_FOLLOWED_LEAGUE_TEAMS = 6`, in `constants.js`). The two sources still cannot coexist:

- **Following a league team** wipes any screenshot teams (`T1`/`T2`/`T3`) first.
- **Uploading/assigning a screenshot team** wipes any followed league teams first.

Cross-source wiping is centralized in `src/utils/teamSourceSwitcher.js` (`ensureSourceIsLeague`, `ensureSourceIsScreenshot`).

**Over the cap:** the hard cap (`MAX_FOLLOWED_LEAGUE_TEAMS = 6`) is enforced at toggle-time inside `/teams_tracker` — a 7th toggle-ON triggers a `show_alert` popup and does not mutate state. The user deselects an existing team before picking a new one; Save persists the final set.

Each team has its own cached data, chip selection, and best-teams calculation. A `selectedTeam` preference determines which team context commands operate on.

### Cache Structure

Team-related caches are **nested by team ID** under each `chatId`:

```javascript
// Per-user, per-team caches
currentTeamCache[chatId][teamId]; // e.g., { T1: { drivers, constructors, ... }, T2: { ... } }
bestTeamsCache[chatId][teamId]; // e.g., { T1: { currentTeam, bestTeams }, T2: { ... } }
selectedChipCache[chatId][teamId]; // e.g., { T1: 'EXTRA_BOOST', T2: 'WILDCARD' }

// Per-user caches (shared across all teams — NOT nested by team ID)
driversCache[chatId]; // driver data shared across teams
constructorsCache[chatId]; // constructor data shared across teams
```

Best-team ranking preferences are stored per team in `userCache[chatId].bestTeamBudgetChangePointsPerMillion`.

### Best-Team Ranking

`/set_best_team_ranking` lets the user choose how much expected budget change should influence `/best_teams` ordering. The calculator ranks teams using projected points plus a hidden budget-change bonus:

`projected_points + (expected_price_change * ranking_value * races_after_next_race)`

The adjusted score drives sorting. When a non-default ranking mode is active, `/best_teams` also shows it as `Budget-Adjusted Points`; in the default `Pure Points` mode that extra line is omitted. The remaining-race count is fetched once at startup and cached in memory. If that cached value is unavailable, `/best_teams` still works for the default `Pure Points` mode and fails for non-zero ranking modes to avoid misleading output.

### Cache Helper Functions

`src/cache.js` exports the following team-aware helpers:

| Function              | Signature                                                    | Purpose                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSelectedTeam`     | `getSelectedTeam(chatId) → string \| null`                   | Returns the user's selected team from `userCache`, or `null` if none set.                                                                                                                 |
| `getUserTeamIds`      | `getUserTeamIds(chatId) → string[]`                          | Returns array of team IDs the user has (keys of `currentTeamCache[chatId]`).                                                                                                              |
| `resolveSelectedTeam` | `resolveSelectedTeam(bot, chatId) → Promise<string \| null>` | Guard function for team-related commands. Auto-resolves single team, prompts user to select for multiple teams, tells user to upload screenshot for no teams. Returns `teamId` or `null`. |

### Team Selection Guard

All team-related commands (`/best_teams`, `/current_team_info`, `/chips`, `/extra_boost`, `/limitless`, `/wildcard`, `/reset_chip`) must call `resolveSelectedTeam(bot, chatId)` at the start and return early if it returns `null`. The guard logic:

1. **0 teams** → sends "upload a screenshot" message → returns `null`.
2. **1 team** → auto-resolves to that team ID (no prompt needed) → returns `teamId`.
3. **2+ teams, `selectedTeam` is set and valid** → returns `selectedTeam`.
4. **2+ teams, `selectedTeam` is not set or invalid** → sends "run `/select_team`" message → returns `null`.

### `selectedTeam` User Preference

Stored in `userCache[chatId].selectedTeam`, following the same pattern as `lang`:

- Persisted to Azure Table Storage via `updateUserAttributes(chatId, { selectedTeam })`.
- Auto-updated when a user uploads a team screenshot with a detected team identifier — the user is notified of the switch.
- Manually changed via the `/select_team` command.
- Cleared when `/reset_cache` is run.

### `/select_team` Command

User command to manually switch between teams:

1. Bot reads `currentTeamCache[chatId]` keys to find available teams.
2. Bot shows an inline keyboard with buttons for each team, ✅ on current selection.
3. User taps a button → `userCache[chatId].selectedTeam` is updated, persisted via `updateUserAttributes`, and confirmed.

Uses `TEAM_CALLBACK_TYPE` callback type in `callbackQueryHandler.js`.

### Azure Blob Storage (Team-Aware)

Blob naming includes the team ID:

| Operation  | Blob Path                                  | Signature                                                                      |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| Read       | `user-teams/{chatId}_{teamId}.json`        | `getUserTeam(chatId, teamId)` — `teamId` is required, no default.              |
| Write      | `user-teams/{chatId}_{teamId}.json`        | `saveUserTeam(bot, chatId, teamId, teamData)`                                  |
| Delete one | `user-teams/{chatId}_{teamId}.json`        | `deleteUserTeam(bot, chatId, teamId)`                                          |
| Delete all | `user-teams/{chatId}_*.json`               | `deleteAllUserTeams(bot, chatId)` — deletes all team blobs for a user.         |
| List all   | Parses `{chatId}_{teamId}` from blob names (splits on the **first** `_` so teamIds containing underscores — e.g. league teams — round-trip correctly; `chatId` is always numeric) | `listAllUserTeamData()` — returns nested `{ chatId: { teamId: data } }`. |

### Image Extraction — Team Identifier

`EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT` in `src/prompts.js` instructs the AI to extract a `teamId` field from team screenshots (found inside a colored square icon next to the team name):

- If `teamId` is successfully extracted → data is stored under that team ID, and `selectedTeam` is auto-updated with a notification to the user.
- If `teamId` is `null` (not detected) → bot asks the user via inline keyboard ("Which team is this screenshot from?") using `TEAM_ASSIGN_CALLBACK_TYPE`. The extracted team data is temporarily stored in **Azure Blob Storage** (`pending-team-assignments/{chatId}_{uniqueKey}.json`) for multi-server support while awaiting the user's selection.

### Updated Command Behaviors

- **`selectChip()`** is now async and accepts `bot` as a parameter (needed for `resolveSelectedTeam`).
- **`/reset_cache`** deletes all teams via `deleteAllUserTeams(bot, chatId)` and clears `selectedTeam`.
- **`/print_cache`** (`getPrintableCache`) shows all teams in a JSON object with a `SelectedTeam` field indicating the active team, plus a `Teams` object containing all team data.

### Constants

| Constant                    | Value            | Purpose                                                           |
| --------------------------- | ---------------- | ----------------------------------------------------------------- |
| `COMMAND_SELECT_TEAM`       | `'/select_team'` | Command string for team selection.                                |
| `TEAM_CALLBACK_TYPE`        | `'TEAM'`         | Callback type for `/select_team` inline keyboard.                 |
| `TEAM_ASSIGN_CALLBACK_TYPE` | `'TEAM_ASSIGN'`  | Callback type for asking user which team a screenshot belongs to. |

### Key Files

| File                                       | Role                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/cache.js`                             | Nested team caches, `getSelectedTeam`, `getUserTeamIds`, `resolveSelectedTeam`, `getPrintableCache` |
| `src/azureStorageService.js`               | Team-aware blob naming (`{chatId}_{teamId}.json`), `deleteAllUserTeams`                             |
| `src/cacheInitializer.js`                  | Populates nested `currentTeamCache` from `listAllUserTeamData()`                                    |
| `src/callbackQueryHandler.js`              | Handles `TEAM_CALLBACK_TYPE` and `TEAM_ASSIGN_CALLBACK_TYPE`, pending assignments via Azure Blob    |
| `src/prompts.js`                           | `teamId` extraction in current team photo prompt                                                    |
| `src/constants.js`                         | `COMMAND_SELECT_TEAM`, `TEAM_CALLBACK_TYPE`, `TEAM_ASSIGN_CALLBACK_TYPE`                            |
| `src/commandsHandler/selectTeamHandler.js` | `/select_team` command handler                                                                      |

---

## Tips for Contributors

- **Console Noise in Tests:** Many tests intentionally log errors. Filter by test file name when diagnosing issues.
- **Time Zone Handling:** `formatDateTime` currently uses `Asia/Jerusalem`; adjust carefully if adding time-sensitive features.
- **Cache Awareness:** Before fetching external data, check relevant caches to avoid redundant requests (see `nextRaceInfoHandler` and `nextRacesHandler`).
- **Multi-Team Awareness:** Team-related caches are nested by team ID. Always use `resolveSelectedTeam(bot, chatId)` as a guard before accessing team-scoped data. Access patterns: `currentTeamCache[chatId]?.[teamId]`, `bestTeamsCache[chatId]?.[teamId]`, `selectedChipCache[chatId]?.[teamId]`.
- **Admin Safeguards:** Use `isAdminMessage` from `src/utils` to restrict sensitive commands.
- **Menu Navigation:** Maintain `MENU_CATEGORIES` order for a consistent UI. Hiding a command from the interactive menu requires setting `hideFromMenu: true` in its category entry.
- **Localization:** Always wrap user-facing strings with `t('key', chatId)` to ensure translation support.
- **Embedding commands inside Markdown messages:** When a `sendMessage` / `editMessageText` call uses `parse_mode: 'Markdown'` and the body contains a command with an underscore (e.g. `/follow_league`, `/best_teams`), the `_` is parsed as italic — the command renders garbled and stops being clickable. The convention is:
  - Use a placeholder in the translation key (e.g. `'Run {FOLLOW_CMD} to track...'`) so the EN source stays clean.
  - At the call site, substitute with `COMMAND_FOO.replace(/_/g, '\\_')` (escaped underscore). Telegram renders this as a literal `_` AND keeps the command tappable. See `helpHandler.js` (per-command listing on line ~49 and "Other Messages" section) for the canonical pattern.
  - Backticks (`` `/cmd_name` ``) also fix the underscore but render the command as inline code → not clickable. Don't use them for commands.
  - Plain-text messages (no `parse_mode`) and HTML-mode messages don't need any escaping — Telegram auto-links `/cmd_name` literally.
- **Keep `AGENTS.md` Up to Date:** After completing any task that changes the codebase structure, adds new commands, modifies architecture, or introduces new patterns, review `AGENTS.md` and update it to reflect the changes. This file is the primary reference for contributors and AI agents — keeping it accurate prevents confusion and misaligned implementations.

With this reference and the checklist above, adding features—especially new commands—should be predictable and safe.

---

## Project Skills (Copilot CLI)

Project-scoped Copilot CLI skills live under `.github/skills/<name>/SKILL.md` and are auto-discovered by the CLI when running inside this repo.

- **`release-announcement`** — Given a commit SHA or ISO date (or auto-detected from the previous `headCommit` saved in `data/announcements.json`), walks the commits up to `HEAD`, lets the admin pick which are user-visible, and produces three Hebrew announcement drafts (תמציתי / שובב / מפורט) ready to be sent via `/broadcast`. After printing the drafts, asks the admin which version to keep and **prepends** it to `data/announcements.json` (newest first) so `/whats_new` can display it later. The only file the skill writes; otherwise read-only on the repo and never sends anything itself. See `.github/skills/release-announcement/SKILL.md`.
