# F1 Fantasy Bot – Agent Handbook

This repository powers an F1 Fantasy assistant on **two channels**:

1. The original **Telegram bot** (long-running surface; see most of this handbook).
2. A new **web-chat agent** (Vite + React + CopilotKit on the frontend, CopilotKit v2 `BuiltInAgent` running on Azure OpenAI on the backend; see [Agent (Web Chat)](#agent-web-chat)).

Both surfaces share the same business logic via **pure cores** in `src/cores/`. The codebase is Node.js/JavaScript, heavily tested with Jest, and organized around command handlers that power Telegram commands, natural-language prompts, and inline menus. The web-chat agent reaches the same logic through tool calls.

---

## Core Concepts

- **Entry Point:** `src/bot.js` bootstraps the Telegram bot, initializes caches via Azure Storage, and registers message/callback listeners. It exports both the bot instance and a `cacheReady` promise. The Azure Function webhook (`telegramWebhook/index.js`) awaits `cacheReady` before processing any update, preventing a race condition where the first cold-start message would be handled before caches are populated.
- **Message Flow:**
  - `src/messageHandler.js` distinguishes between text, photo, and other message types. It also checks for pending replies (see Pending Reply Manager below) before routing to type-specific handlers.
  - `src/textMessageHandler.js` routes command strings to handler functions defined in `src/commandsHandler`.
  - Generic command execution is centralized in `src/commandsHandler/commandHandlers.js`, which maps command constants to handler implementations.
- **Pending Reply Manager:** `src/pendingReplyManager.js` provides a centralized mechanism for commands that need a follow-up reply from the user (text or photo). State is stored in **Azure Table Storage** for multi-server support. The check happens in `messageHandler.js` **before** the text/photo branching, so reply handlers receive the full message regardless of type. Supports optional `data` parameter for multi-step commands that need to store intermediate state between steps. **Global cancel:** `messageHandler.js` intercepts `/cancel`, `cancel`, or `ביטול` (case-insensitive) while any pending reply is active — it clears the entry and confirms with `t('Operation cancelled.')`. This works for every command registered in the pending-reply registry without any per-command changes.
- **Pending Reply Registry:** `src/pendingReplyRegistry.js` maps command identifiers (e.g., `'report_bug'`, `'send_message_to_user'`, `'set_nickname'`) to builder functions that reconstruct handlers, validators, and prompts. This enables serializable storage — only the command ID and optional data are persisted, and the full behavior is rebuilt on any server instance. Builder functions receive `(chatId, data)` where `data` is optional stored state for multi-step commands.
- **Caching:** `src/cache.js` holds in-memory data for drivers, constructors, current team info, simulations, next race info, weather forecasts, a cached remaining-race count, canonical prices/player entries, and a unified `userCache`. Team-related caches (`currentTeamCache`, `bestTeamsCache`, `selectedChipCache`) are **nested by team ID** — see the [Multi-Team System](#multi-team-system) section below. `src/cacheInitializer.js` populates those caches on startup — most data comes from Azure Blob Storage (with team-aware blob naming), while `userCache` is populated from the `UserRegistry` Azure Table via a single `listAllUsers()` call. Driver/constructor projections still come from `f1-fantasy-data.json`, but prices and player activity metadata come from the root `prices.json` blob and are overlaid through `getDriversForChat(chatId)` / `getConstructorsForChat(chatId)` for calculations. League teams retain parallel `driverIds`/`constructorIds` arrays from `teams-data.json`; `src/utils/bestTeamsData.js` uses those IDs only for enriched best-team/current-team calculations so duplicate codes remain distinguishable. Active drivers are transfer candidates, while owned inactive drivers stay available with `-25` points on regular weekends or `-35` on sprint weekends and zero expected price change. Imported chat-specific driver/constructor data remains raw and uses the legacy code-keyed path. Each entry in `userCache` is keyed by `chatId` and holds `{ lang, nickname, chatName, selectedTeam, ... }`.
- **Display Names:** `src/utils/utils.js` provides `getDisplayName(chatId)` which checks the in-memory `userCache` and returns the nickname if set, then falls back to `chatName`, then to the stringified `chatId`. This is used in `messageHandler.js` for all log messages so admins see nicknames in logs instead of Telegram display names.
- **User Registry:** `src/userRegistryService.js` tracks all users who interact with the bot in an Azure Table Storage table (`UserRegistry`). On every allowed message, `messageHandler.js` calls `upsertUser(chatId, chatName)` in a fire-and-forget manner (no `await`) so that registry failures never block message handling. The `/list_users` admin command (`src/commandsHandler/listUsersHandler.js`) displays all registered users with their details, including nicknames when set.
- **Utilities & Services:**
  - `src/utils` contains Telegram helpers, formatting (`formatDateTime`), display name resolution (`getDisplayName`), and logging utilities.
  - **Logging:** `sendLogMessage(bot, message)` sends informational messages to `LOG_CHANNEL_ID`. `sendErrorMessage(bot, message)` sends error messages to **both** `LOG_CHANNEL_ID` and `ERRORS_CHANNEL_ID` — use it wherever an error, failure, or exception is being reported. Both constants are defined in `src/constants.js`.
  - `src/utils/weatherApi.js` interacts with external weather services.
  - `src/azureStorageService.js` and `src/azureBillingService.js` wrap Azure integrations.
- **Internationalization:** `src/i18n.js` and `src/translations.js` provide language support (English/Hebrew) used throughout handlers.
- **AI Assist:** `src/prompts.js` defines system prompts. `/ask`-style natural language queries are handled by `src/commandsHandler/askHandler.js`, which leverages Azure OpenAI to map free-text requests into command sequences.
- **Logic Cores:** `src/cores/` holds **pure** business-logic functions that take inputs and return structured JSON. They do not depend on `bot`, `t()`, or `sendMessage`. Each Telegram handler is being progressively refactored into `(pure core in src/cores/) + (thin Telegram adapter)`. The same core is consumed by the web-chat agent's tools — so a question like "best teams with VER but no ALO" runs through the same calculator as the `/best_teams` command. **Refactor rule:** existing handler tests must keep passing unchanged after the extraction; if they don't, fix the refactor, not the test. Cores extracted so far: `nextRacesCore`, `bestTeamsCore`, `userTeamsCore`, `followedTeamsCore`, `leaderboardCore`, `bestTeamScenariosCore`, `nextRaceInfoCore`, `raceWeatherCore`, `deadlineCore`, `currentTeamCore`, `liveScoreCore`. Cores that need side effects (e.g. weather fetch logging) accept optional `onFetch`/`onError` callbacks — the Telegram adapter wires them to bot-side helpers; the agent path omits them. Pure scoring helpers shared between a handler and its core live in `src/utils/` (e.g. `src/utils/liveScoreCalc.js` for `mapLockedTeamForScoring` / `calculateLiveScoreBreakdown` / `deriveLiveScoreOptions`) so the core never depends on the adapter.
- **Agent (Web Chat):** `src/agent/`, `agentWebhook/`, and `web/` together implement a second user-facing surface. **Identity is per-request**, propagated through `AsyncLocalStorage` from the agent webhook into `getAgentChatId()`. The webhook verifies the caller's Google ID token, looks the email up in the `WebUserAllowlist` Azure Table to resolve a Telegram chatId, then runs the entire CopilotKit invocation inside that ALS scope. When `GOOGLE_CLIENT_ID` is unset (local dev only — both production AND test slots in Azure set it) the auth gate is bypassed and `AGENT_HARDCODED_CHAT_ID` is used instead. The test slot additionally enforces an **admin-only** filter via `AGENT_REQUIRE_ADMIN=true` — see [Web auth → Test-slot admin-only gate](#test-slot-admin-only-gate). See [Web auth](#web-auth) for the full pipeline and the three new Telegram admin commands (`/allow_web_user`, `/revoke_web_user`, `/list_web_users`) that manage the allowlist.

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
- `/menu`, `/help`, `/lang`, `/whats_new`
- `/follow_league`, `/unfollow_league`, `/teams_tracker`, `/leaderboard`, `/league_graphs`, `/league_changes`
- `/report_bug` _(reply-based — uses pending reply manager)_

**Admin-only:** `/trigger_scraping`, `/trigger_api_data`, `/trigger_api_data_locked`, `/trigger_next_race_info`, `/trigger_live_score_scheduler`, `/get_botfather_commands`, `/billing_stats`, `/version`, `/list_users`, `/send_message_to_user`, `/broadcast`, `/set_nickname`, `/live_score`, `/upload_drivers_photo`, `/upload_constructors_photo`, `/allow_web_user`, `/revoke_web_user`, `/list_web_users`

### Announcements file (`/whats_new`)

`data/announcements.json` is a committed array of release-announcement entries (newest first). The `release-announcement` skill **writes** to it (after the admin picks Standard/WOW); `src/announcementsService.js` **reads** it and `src/commandsHandler/whatsNewHandler.js` exposes the latest entry via the user-facing `/whats_new` command. Each entry has shape `{ id, createdAt, version: 'standard'|'wow', sinceRef, headCommit, text }` where `text` is the Hebrew Markdown body **without** the `### 📋`/`### 🔥` title line, fence wrappers, or backticks around `/commands`. The handler sends `text` with `parse_mode: 'Markdown'` (with plain-text fallback on parse errors) and escapes underscores inside `/command` tokens at send time so Telegram auto-links them instead of consuming the underscore as an italic marker. Missing or malformed file → handler shows a localized "no announcements yet" message and the skill treats it as `[]`.

---

## Environment & Deployment

Required environment variables (see `readme.md` for full list):

- Telegram: `TELEGRAM_BOT_TOKEN`
- Azure OpenAI: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPEN_AI_MODEL`
- Azure Storage: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`
  - **Note:** `AZURE_STORAGE_CONNECTION_STRING` is also used by the Pending Reply Manager and User Registry Service for Azure Table Storage (no additional env var needed).
- Azure Management API for billing and manual Logic App triggers: `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
  - `AZURE_RESOURCE_GROUP` is optional and defaults to `f1-fantazy-bot`.
- Agent (web chat) only: `AGENT_HARDCODED_CHAT_ID` — the Telegram chatId the agent acts as for v1 (single-user mode). Read by `src/agent/identity.js`; the LLM never sees this value. Required by `agentWebhook/` and by `scripts/dev-agent-server.js`.

Start the bot with `npm start` (polling in dev) or configure webhook as needed for production.

Start the web-chat agent locally with `npm run dev` (boots both the agent dev server on `:7071` and the Vite frontend on `:5173/:5174` under one terminal, via `concurrently`). Or run them separately: `npm run dev:agent` / `npm run dev:web`. See [Agent (Web Chat) → Local dev](#local-dev-workflow) for details.

**Cold-Start Initialization (Telegram):** `src/bot.js` stores the `initializeCaches()` promise as `cacheReady` and exports it. The Azure Function webhook (`telegramWebhook/index.js`) awaits `bot.cacheReady` before calling `bot.processUpdate(update)`. On a cold start the first request waits for caches to be ready; on warm invocations the resolved promise returns instantly. In polling dev mode `cacheReady` is unused — the natural polling delay avoids the race.

**Cold-Start Initialization (Agent):** `src/agent/cacheBootstrap.js` lazily calls `initializeCaches()` before cache-dependent agent tools run. `get_next_races` can still answer without cache data, but `list_user_teams`, `list_followed_teams`, `list_user_leagues`, `get_leaderboard`, `get_best_teams`, and `get_best_team_scenarios` all depend on the same initialized caches as Telegram.

**Deployment targets:**
- The Telegram bot is deployed as the existing Azure Function App `f1-fantazy-bot-func` via the `telegramWebhook/` function. Push to `main` → `production` slot; PR → `test` slot.
- The web-chat agent is deployed to a **separate Azure Function App** (`f1-fantazy-agent-func`) via the `agentWebhook/` function — keeping it independent for deploy, scale, and failure-isolation reasons (an agent rollout cannot break the Telegram bot). Push to `main` → `production` slot; PR → `test` slot. The agent's deploy package EXCLUDES `telegramWebhook/` and other non-agent paths (see `.funcignore.agent` and the `Strip non-agent paths from the package` step in `.github/workflows/main_f1-fantazy-agent-func.yml`) so the isolation goal is enforced mechanically.
- The frontend has **two** Azure Static Web Apps (both Free SKU, both in `westeurope`):
  - **Production:** `f1-fantazy-agent-web` at the prod custom domain `https://f1.kilzid.com` (CNAME → the SWA's auto-generated `calm-beach-055be4603.7.azurestaticapps.net`). Push to `main` → `production` environment.
  - **PR validation / staging:** `f1-fantazy-agent-web-test` at the custom domain `https://test.f1.kilzid.com` (CNAME → its auto-generated `proud-sky-035c6b003.7.azurestaticapps.net`). Every PR replaces the content of its `default` environment; `stagingEnvironmentPolicy: Disabled` so per-PR ephemerals can't be created by mistake.
  Two-SWA model was chosen over upgrading to Standard SKU because (a) Free SKU is sufficient at our scale and (b) isolation — a PR build can never accidentally publish to prod. Both PR-validation builds bake `VITE_AGENT_API_URL` pointing at the agent Function App's `test` slot so PR builds exercise the end-to-end stack against the slot version of the backend.
- All Azure resources live in resource group `f1-fantazy-bot` in subscription `5cfc4033-…` (`westeurope`). The agent Function App reuses the existing App Service Plan `ASP-f1fantazybot-b551` (Y1 Consumption, supports slots), storage account `f1fantazybot9eca`, Key Vault `f1-fantasy-kv`, and Application Insights `f1-fantazy-bot-func`. Agent-specific KV secret: `agent-hardcoded-chat-id`. Agent Telegram notifier token comes from Key Vault secret `telegram-bot-token` on both slots; log messages are distinguished with `LOG_ENV`.
- ARM templates: `infra/agent-func/azuredeploy.json` (Function App) + `infra/agent-web/azuredeploy.json` (prod SWA) + `infra/agent-web-test/azuredeploy.json` (test SWA). Parameter files alongside each. Run `npm run deploy:agent-func` / `deploy:agent-web` / `deploy:agent-web-test` to apply locally; the `deploy-infra-agent-func.yml` / `deploy-infra-agent-web.yml` / `deploy-infra-agent-web-test.yml` workflows do the same on push to `main` when those paths change.
- CORS is handled in `agentWebhook/index.js` (via `src/agent/corsAllowList.js`), not by Azure's `siteConfig.cors` layer, because SWA preview environments need regex matching that the Azure layer doesn't support. Env vars: `AGENT_CORS_ALLOWED_ORIGINS` (comma-separated exact origins) + `AGENT_CORS_PREVIEW_ORIGIN_PATTERN` (regex). When both are unset (local dev), the matcher returns `*` for back-compat. See `readme.md` → "Deploying the agent" for the one-time bootstrap checklist.

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
- **Single-step (broadcast):** See `src/commandsHandler/broadcastHandler.js` — the `/broadcast` admin command registers `'broadcast'` as a pending reply. The handler in `src/pendingReplyRegistry.js` fetches all users via `listAllUsers()`, sends the broadcast text or photo to each recipient, and reports a success/failure summary back to the admin.
- **Multi-step:** See `src/commandsHandler/sendMessageToUserHandler.js` — the `/send_message_to_user` admin command uses a two-step reply flow with intermediate data storage. Step 1 collects the target user's chat ID (validated against the User Registry), then re-registers with `{ step: 'collect_message', targetChatId }`. Step 2 collects text or a photo and sends it to the target user. The handler uses lazy `require` for `pendingReplyManager` to avoid circular dependencies.
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
- `leagues/{leagueCode}/teams-data.json` — header + `teams: [{ teamName, userName, position, budget, transfersRemaining, drivers, constructors }]` where each roster entry is `{ id, name, price, isCaptain, isMegaCaptain, isFinal }`. Used by `/teams_tracker` to load/manage followed team rosters from the league directly into the bot's cache. `budget` is the user's cost cap going into the upcoming matchday (`team_info.maxTeambal` from upstream — see f1-fantasy-api-data PR #19). The bot's `mapLeagueTeamToBotTeam` derives `costCapRemaining = max(0, budget − Σ_prices)`. Blobs written before that PR shipped carried `budget = team_info.teamVal` (≈ Σ_prices) which trivially yields `costCapRemaining = 0` through the same formula — same as production today, no regression during the deployment transition.
- `leagues/{leagueCode}/locked/matchday_{N}.json` — one blob per locked matchday written by the upstream `MODE=locked` scrape (fires ~1 minute after each session start: qualifying, race, and on sprint weekends the sprint race). Same per-team shape as `teams-data.json` plus a top-level `mode: 'locked'` discriminator and per-team `chipsUsed: [{ name, gameDayId }]`. Used by `/league_changes` and `/live_score`.
- `prices.json` — root-level global price snapshot `{ fetchedAt, matchdayId, drivers: [{ id, name, price }], constructors: [{ id, name, price }] }`. Used by startup and `/load_simulation` as the canonical price source for `/best_teams`, `/best_team_scenarios`, `/current_team_info`, and related team-change details. Names are mapped to bot codes via `NAME_TO_CODE_DRIVERS_MAPPING` / `NAME_TO_CODE_CONSTRUCTORS_MAPPING`; unmapped, invalid, or missing entries are reported to admins and fall back to simulation/imported prices.

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

   **Session lifecycle.** The staging state is stored in Azure Blob Storage at `teams-tracker-sessions/{chatId}.json` with shape `{ chatId, messageId, currentView, currentLeagueCode, selected:[{leagueCode, teamId}], initiallyFollowed:[teamId], addOrder:[teamId], updatedAt }` and survives across servers. Every `TT:*` callback verifies `query.message.message_id === session.messageId` AND `now - updatedAt <= TEAMS_TRACKER_SESSION_TTL_MS` (30 min). Mismatch or expiry → `show_alert` "This Teams Tracker view has expired…" + delete session; do not mutate state. Reopening `/teams_tracker` overwrites any existing session (re-seeded) and best-effort-edits the old message with an "expired" notice.

   **Save logic (deterministic active-team resolution).** At save, each touched league's `teams-data.json` is re-fetched (drops stale positions with a `⚠️ {N} team(s) could not be added` warning). For the final set of followed teamIds: if previous `selectedTeam` still exists in the set → keep it; else first entry of `addOrder` still followed; else first remaining followed team; else clear. Cross-source rule: if save produces ≥1 league team, screenshot teams (`T1`/`T2`/`T3`) are wiped first via `ensureSourceIsLeague`. Persistence is a single `updateUserAttributes({ selectedTeam, selectedBestTeamByTeam })` call.

   **Callback types.** `TEAMS_TRACKER_CALLBACK_TYPE = 'TT'` with actions `TEAMS_TRACKER_ACTIONS = { OPEN_LEAGUE:'L', TOGGLE:'T', BACK:'B', SAVE:'S', CANCEL:'C' }`. Payload formats: `TT:L:{leagueCode}`, `TT:T:{leagueCode}:{teamId}`, `TT:B`, `TT:S`, `TT:C`. The TOGGLE payload uses the canonical fantasy `teamId` (`{sanitize(userName)}_{teamNo}`) rather than a row position — this disambiguates rows tied at the same league position (without it, two teams sharing position 5 would be indistinguishable). Worst-case payload size: `TT:T:` (5) + leagueCode (~11) + `:` + teamId (≤42) ≈ 59 chars, under Telegram's 64-byte `callback_data` limit.

   **Shared helpers.** The league-team read/write logic lives in `src/utils/leagueTeamHelpers.js` (`mapLeagueTeamToBotTeam`, `loadLeagueTeamsData`, `refreshLeagueTeamsData`, `followLeagueTeam`, `removeFollowedTeam`, `extractLeagueCode`, `buildLeagueNameMap`, `buildTeamLabel`). `followLeagueTeam` does **not** mutate `selectedTeam` — Teams Tracker save owns active-team resolution end-to-end. `removeFollowedTeam(chatId, teamId, { mutateSelectedTeam = true })` exposes a flag used by save to defer active-team mutation.
7. `/league_graphs` opens a two-step flow that renders per-league charts. Same 0/1/N league-selection flow as `/leaderboard` (callback type `LEAGUE_GRAPH_CALLBACK_TYPE`), followed by a graph-type picker (callback type `LEAGUE_GRAPH_TYPE_CALLBACK_TYPE`, payload `LEAGUE_GRAPH_TYPE:<gap|standings|budget>:<leagueCode>`). Three graph types are available:
   - **Gap to Leader** — line chart of each team's cumulative gap to the leader per race (leader sits on 0; everyone else is at or below 0). Chip usage is drawn as an emoji + chip-name label on the specific data point using the `chartjs-plugin-datalabels` plugin.
   - **Standings** — line chart of each team's **rank per race** computed from cumulative `raceScores` with competition-style ties (1, 2, 2, 4). Y-axis is reversed so rank 1 sits at the top, integer ticks with `stepSize: 1`, `min: 1`, `max: teams.length`. Legend is sorted by current-race rank ascending. Chip markers reuse the same emoji + chip-name datalabels pattern as Gap to Leader.
   - **Budget** — line chart of each team's **start-of-race budget** (`raceBudgets.matchday_N`, i.e. `maxTeambal` at the start of each race) per race. No chip annotations — clean lines only. Gaps in the data render as broken line segments (`spanGaps: true` + `null` values). Legend sorted by each team's most recent recorded budget, highest first (tie-break on `position`).

   Chart rendering is delegated to [`quickchart-js`](https://quickchart.io) — each handler builds a Chart.js config, calls `chart.getShortUrl()`, and sends the URL via `bot.sendPhoto` (Telegram fetches the PNG itself, no native `canvas` dep). X-axis labels use the short race name (e.g. `Chinese GP`) — `matchday_N` is mapped to round `N` in the current Jolpica/Ergast season schedule (`fetchCurrentSeasonRaces`) and `raceName` is shortened (`Grand Prix` → `GP`); falls back to `R{N}` if the mapping can't be resolved. Chip → emoji mapping lives in `src/utils/chipEmojis.js`. The shared color palette and `buildRoundToRaceNameMap`/`matchdayNumber`/`getSortedMatchdayKeys` helpers are exported from `leagueGraphHandler.js` and reused by `leagueBudgetGraphHandler.js` and `leagueStandingsGraphHandler.js`.

8. `/league_changes` (`src/commandsHandler/leagueChangesHandler.js`) renders a per-team diff between **`teams-data.json` (Monday planning view) and the latest locked snapshot for the same matchday** (`leagues/{code}/locked/matchday_{N}.json`). The diff captures exactly what the user committed during week N's planning window — transfers, captain choice, mega-captain choice, and chip activation. Same 0/1/N league-selection flow as `/leaderboard` (callback type `LEAGUE_CHANGES_CALLBACK_TYPE`). Teams in the latest snapshot are joined on `userName` against the teams-data view; output lines: drivers in/out, constructors in/out, captain change, mega-captain change, and chips activated **for this matchday only**. Teams with no diff are summarised in a `(N other team(s) had no changes)` tail line; brand-new teams (in locked but absent from teams-data) are shown as `🆕 new team`. If the locked snapshot's `matchdayId` doesn't match the teams-data's `matchdayId` (the post-Monday/pre-next-quali window), the bot shows a friendly "wait for next session lock" message instead of rendering a misleading diff. **Chip-this-week filter:** each chip entry in the locked snapshot carries a `gameDayId` field whose value (despite the misleading name — F1 Fantasy's API uses `<chip>takengd`) is actually the matchday the chip was activated for. So `chips.filter(c => c.gameDayId === locked.matchdayId)` keeps only chips activated this week; older entries from previous matchdays are filtered out. The locked roster preserves Limitless mega-squad rosters since the locked-snapshot scrape captures state before Limitless auto-reverts post-race.

9. `/live_score` (admin-only, `src/commandsHandler/liveScoreHandler.js`) is a 2-step inline-keyboard flow scoped strictly to **league-locked data** (no screenshot-team or `currentTeamCache` fallback). Step 1 is the standard 0/1/N league picker (callback `LS:L:{leagueCode}`). Step 2 is the team picker — fetched from the chosen league's latest `leagues/{code}/locked/matchday_{N}.json` snapshot — sorted by `position`, with a 🏁 **All teams** button at the top (callback `LS:A:{leagueCode}`) and one button per team (callback `LS:T:{leagueCode}:{sanitizedTeamName}`). Picking a specific team renders the existing per-driver / per-constructor breakdown via `calculateLiveScoreBreakdown`: captain (`isCaptain` → Boost x2) and mega captain (`isMegaCaptain` → Extra Boost x3) are read directly from the locked snapshot's per-driver flags; names are mapped to bot codes via `mapNameToCode`. Picking **All teams** renders a leaderboard of every team in the league sorted by total live points DESC (tie-break: total live price change DESC); the user's `selectedTeam` row, if it lives in this league, is bolded for visual orientation. Callback type `LIVE_SCORE_CALLBACK_TYPE = 'LS'` with actions `LIVE_SCORE_ACTIONS = { LEAGUE: 'L', TEAM: 'T', ALL: 'A' }` — kept short so the worst-case payload `LS:T:{leagueCode}:{sanitizedTeamName}` (~56 bytes) stays under Telegram's 64-byte `callback_data` limit. The shared private helper `mapLockedTeamForScoring(lockedTeam)` extracts the `{drivers, constructors, boostDriver, extraBoostDriver}` shape consumed by `calculateLiveScoreBreakdown`. **Scoring rules beyond captain multipliers** are applied via `deriveLiveScoreOptions(lockedTeam)`, which returns `{ noNegativeActive, transferPenalty }` derived from the team's `transfersRemaining` and `chipsUsed` (filtered by `gameDayId === matchdayId`): (a) **transfer penalty** — `EXTRA_TRANSFER_PENALTY_POINTS` (= 10, defined in `constants.js` and shared with `bestTeamsCalculator.js`) for each excess transfer when `transfersRemaining < 0`, **waived** when Wildcard or Limitless is active for THIS matchday; (b) **No Negative chip** — when active for THIS matchday, every driver and constructor's negative `TotalPoints` is clamped to 0 *before* the captain / mega-captain multiplier runs. The per-team rendered message gains `<b>Transfer Penalty:</b> -N (Pre-penalty: M)` and/or `🛡️ No Negative chip active` lines when applicable; the all-teams leaderboard adds a `†` marker on penalised rows + a footer `† transfer penalty applied` when at least one row has it.

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
| `listLockedMatchdays` | `listLockedMatchdays(leagueCode) → Promise<number[]>`                              | (in `azureStorageService.js`) Lists numeric matchday IDs under `leagues/{code}/locked/`. Sorted ascending. Empty array when no locked snapshot exists yet. |
| `getLockedTeamsData`  | `getLockedTeamsData(leagueCode, matchdayId?) → Promise<Object\|null>`              | (in `azureStorageService.js`) Fetches `leagues/{code}/locked/matchday_{N}.json`. When `matchdayId` is omitted, auto-resolves to the latest available. Returns `null` when no snapshot exists. |

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
- **League flow:** `{sanitize(userName)}_{teamNo}` (e.g. `Doron-Kilzi_1`) — derived from the F1 Fantasy account login + the team number (1/2/3) within that account. **League-agnostic by design**: the same F1 Fantasy team has the same id in every league it appears in. `userName` is sanitized to be blob-path-safe (only word chars and `-` survive; truncated to 40 chars) and joined with `teamNo` by a literal `_`. Built via `buildLeagueTeamId(userName, teamNo)` in `src/utils/teamId.js`.

Picking a team from a league **adds it** to the user's followed league teams (up to `MAX_FOLLOWED_LEAGUE_TEAMS = 6`, in `constants.js`). The cap counts **distinct fantasy teams**, not raw selection rows — selecting the same `Kilzid_1` from two leagues in `/teams_tracker` counts as one slot. The two sources still cannot coexist:

- **Following a league team** wipes any screenshot teams (`T1`/`T2`/`T3`) first.
- **Uploading/assigning a screenshot team** wipes any followed league teams first.

Cross-source wiping is centralized in `src/utils/teamSourceSwitcher.js` (`ensureSourceIsLeague`, `ensureSourceIsScreenshot`).

**Over the cap:** the hard cap (`MAX_FOLLOWED_LEAGUE_TEAMS = 6`) is enforced at toggle-time inside `/teams_tracker` — a 7th toggle-ON triggers a `show_alert` popup and does not mutate state. The user deselects an existing team before picking a new one; Save persists the final set.

Each team has its own cached data, chip selection, and best-teams calculation. A `selectedTeam` preference determines which team context commands operate on.

### Cross-league active team

Because the league teamId is `{sanitize(userName)}_{teamNo}`, every consumer of `getSelectedTeam(chatId)` — graphs, leaderboard, `/best_teams`, `/current_team_info`, `/chips`, `/select_team`, `/live_score`, etc. — automatically treats the user's active team as **the same team across every league it appears in**. The 3 `/league_graphs` charts thicken the active team's line in every league it shows up in; `/leaderboard` bolds its row in every league; `/select_team` lists fantasy teams (not per-league entries).

In Teams Tracker, selections are **visually synced across leagues**: toggling `Kilzid_1` ON in League A automatically shows ✅ for `Kilzid_1` in League B if that team also appears there, because both rows resolve to the same fantasy id. The session payload (`session.selected[]`) carries `{ leagueCode, teamId }` entries — one per league where the followed fantasy team appears — so the UI stays visually consistent while the persisted follow state collapses to one entry per fantasy id. Position is intentionally NOT stored — it's looked up fresh from `loadLeagueTeamsData` at render time, which sidesteps the tied-position ambiguity (two teams in the same league can share a position).

### Cache Structure

Team-related caches are **nested by team ID** under each `chatId`:

```javascript
// Per-user, per-team caches
currentTeamCache[chatId][teamId]; // e.g., { T1: { drivers, constructors, ... }, 'Doron-Kilzi_1': { ... } }
bestTeamsCache[chatId][teamId]; // e.g., { 'Doron-Kilzi_1': { currentTeam, bestTeams }, T2: { ... } }
selectedChipCache[chatId][teamId]; // e.g., { 'Doron-Kilzi_1': 'EXTRA_BOOST', T2: 'WILDCARD' }

// Per-user caches (shared across all teams — NOT nested by team ID)
driversCache[chatId]; // driver data shared across teams
constructorsCache[chatId]; // constructor data shared across teams
pricesCache; // canonical prices from prices.json, keyed by bot code
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
| `getDriversForChat` / `getConstructorsForChat` | `(chatId) → Object \| undefined` | Returns the effective driver/constructor map for calculations: chat-specific cache if present, otherwise shared simulation cache, with `pricesCache` overlaid when available. Use these for price-sensitive calculations; use raw caches only for import/export/reset checks. |

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

## Agent (Web Chat)

A second user-facing surface that runs the same business logic as the Telegram bot through tool calls. Architecture, code layout, and the patterns for adding new capabilities live in this section.

**Status (2026-05-18):** v1 capability scope is COMPLETE; Phase 6 (polish & hardening) is in flight. Phase 6.1 (per-step token-usage logging via AI SDK middleware, PR [#188](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/188)) and Phase 6.2 (friendly tool-error UX with opaque `errorId`, PR [#189](https://github.com/F1-fantazy-bot/f1-fantazy-bot/pull/189)) are merged. See [Token usage logging](#token-usage-logging-phase-61) and [Tool error handling](#tool-error-handling-phase-62) below.

Phase-5 capabilities (shipped — v1 capability scope is now COMPLETE):

- `get_next_races` — upcoming races for the season (Phase 1).
- `list_user_teams` — the user's tracked teams (teamId + friendly teamName) (Phase 2).
- `get_best_teams` — top scoring fantasy combinations with optional must-include / must-exclude filters on drivers and constructors (Phase 2). The marquee _"best teams for X with Verstappen but no Alonso"_ question runs here. Reads canonical prices via `getDriversForChat` / `getConstructorsForChat` so price-aware rankings work without user-uploaded JSON. Sort criteria: `'points'` (raw projected points) or `'budget_adjusted'` (weights expected price change by the user's saved `budgetChangePointsPerMillion` preset — set via `/set_best_team_ranking` in Telegram). "Points per million" questions resolve to `'budget_adjusted'`; the deprecated `'points_per_million'` value-for-money sort was removed.
- `get_best_team_scenarios` — 4×4 matrix of top best team across the 4 budget-adjusted weight presets (0, 1.3, 1.65, 2.0 ppm) × 4 chip scenarios (no chip, Limitless, Extra Boost, Wildcard) (Phase 3). Each cell reports `projectedPoints`, `expectedPriceChange`, and a `recommendation` (`null`/`'yellow'`/`'green'`) indicating the chip's lift vs. the no-chip baseline of the SAME ppm row, mirroring the Telegram `/best_team_scenarios` indicators.
- `list_followed_teams` — the user's followed league teams enriched with the leagues each team appears in + position in each (Phase 3).
- `list_user_leagues` — the private leagues the user has followed via `/follow_league` (Phase 3).
- `get_leaderboard` — standings for one of the user's followed leagues (Phase 3). Returns status-tagged result (`ok` / `not_followed` / `not_found` / `invalid_input`) plus `selectedTeamId` for client-side highlighting.
- `get_next_race_info` — full info on the next race: circuit, location, weekend format (regular/sprint), session timestamps, historical stats, multi-language track history, and opportunistic weather snapshot. Reads `nextRaceInfoCache[sharedKey]` + `weatherForecastCache`; on cache miss the core calls `getWeatherForecast` directly (Phase 4).
- `get_race_weather` — per-session hourly weather forecast (up to 3 hours per session, filtered to drop hours already in the past) for the next race weekend (Phase 4).
- `get_deadline` — next team-lock deadline (start of the first locking session: sprint on sprint weekends, qualifying otherwise). Returns absolute timestamps (`sessionStartsAt`, `nowIso`) — the web UI's `<DeadlineCountdown />` ticks client-side with skew compensation so the server's clock stays the source of truth (Phase 4).
- `get_current_team` — the user's CURRENT saved/selected roster: drivers, constructors, captain, mega-captain, chip, free transfers, cost cap, expected points, expected price change, plus budget-adjusted points when a non-zero ppm preset is set. Resolves team via the same `bestTeamsCore.pickTeamId` pattern (Phase 5). Status-tagged: `ok` / `no_teams` / `unknown_team` / `ambiguous_team` / `missing_cache`.
- `get_live_score_for_team` — per-team live score breakdown (per-driver / per-constructor points, captain x2 / mega-captain x3 multipliers, transfer penalty, No Negative chip, session breakdowns) for ONE team in ONE followed league. Defaults to the user's `selectedTeam` when no `teamId` / `teamName` provided (Phase 5).
- `get_live_score_leaderboard` — all-teams live leaderboard for ONE followed league. Sorted by total live points desc (tie-break: total live price change desc). User's row marked with `isSelected: true` for client highlighting (Phase 5).

**Multi-team "every team I track" pattern.** When the user asks a multi-team
question like _"best teams by points-per-million for every team I track"_,
the agent does NOT fan out N `get_best_teams` calls. It calls
`list_followed_teams`, surfaces the team names back to the user, and asks
them to pick one team to focus on — then runs `get_best_teams` ONCE for
the chosen team. This keeps the chat to a single rich render per question
and sidesteps the `parallelToolCalls: false` rendering constraint.

### Architecture

```
Browser (Vite + React + CopilotKit)
   ┌─────────────────────────────────────────────┐
   │ <CopilotKit runtimeUrl={…}>                 │
   │   <CopilotChat />                           │
   │   useCopilotAction({                        │
   │     name: 'get_next_races',                 │
   │     available: 'frontend',                  │  ← render-only
   │     render: ({ status, result }) => …       │     for backend tools
   │   });                                       │
   └─────────────────────────────────────────────┘
                │  HTTPS · CopilotKit data-stream protocol
                ▼
   ┌─────────────────────────────────────────────┐
   │ agentWebhook/  (Azure Function, separate    │
   │   App from telegramWebhook)                 │
   │ • Bridges Azure Functions v3 (context, req) │
   │   onto a Web Request, returns Web Response  │
   │ • Tolerates BOTH Uint8Array AND string body │
   │   chunks (the response stream emits both)   │
   │ • Permissive dev CORS; tightened in prod    │
   └─────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────┐
   │ src/agent/runtime.js                        │
   │ • createCopilotRuntimeHandler({             │
   │     runtime, basePath, mode: 'single-route',│
   │     cors: true,                             │
   │   })  from '@copilotkit/runtime/v2'         │
   │ • CopilotRuntime({ agents: { default } })   │
   │ • BuiltInAgent({ model, prompt, tools,      │
   │     maxSteps: 5 })                          │
   │ • Model: @ai-sdk/azure → azure.chat(deploy) │
   │   built with useDeploymentBasedUrls: true   │
   │   for both *.openai.azure.com and           │
   │   *.services.ai.azure.com endpoints.        │
   └─────────────────────────────────────────────┘
                │
                ▼ tool execute
   ┌─────────────────────────────────────────────┐
   │ src/cores/*  (pure functions)               │
   │ • Same module imported by refactored        │
   │   Telegram handlers — single source of      │
   │   truth for business logic.                 │
   └─────────────────────────────────────────────┘
```

### Why this stack

| Decision | Why |
|---|---|
| **CopilotKit v2** (`@copilotkit/runtime/v2`) | Rich React chat components with `useCopilotAction({ render })` for per-tool generative UI; runs tool execution server-side via `BuiltInAgent`. |
| **Vercel AI SDK** under the hood (not the `openai` SDK directly) | CopilotKit v2 ignores bare `actions:` on `CopilotRuntime` — it requires an `agents:` map. `BuiltInAgent` uses AI SDK's `streamText` internally. We accepted this even though we initially planned to reuse the existing `openai`-SDK pattern. |
| **`@ai-sdk/azure`** with `useDeploymentBasedUrls: true` | Stock `@ai-sdk/openai` builds URLs as `/openai/responses` — wrong for Azure. The Azure provider knows the `/openai/deployments/{model}/chat/completions?api-version=…` shape. Pass `baseURL: '${endpoint}/openai'` so it works for both `*.openai.azure.com` (classic) and `*.services.ai.azure.com` (Azure AI Foundry) hosts. Use `azure.chat(deploymentId)` — `azure(deploymentId)` returns the `/responses` API model and 404s on most deployments. |
| **Zod** for tool parameters | Required by `defineTool` (Standard Schema V1). Already a transitive dep through `@copilotkit/runtime`. |
| **Single-route mode** on the runtime handler | The default `multi-route` mode would force the frontend to address per-route URLs; single-route keeps the frontend pointed at `{basePath}` with a JSON envelope. Side effect: `GET /threads?agentId=…` returns 405 in single-route — these errors in the browser console are harmless and represent chat-history persistence we haven't enabled. |
| **`parallelToolCalls: false`** on the agent's `providerOptions.openai` | CopilotKit's `useLazyToolRenderer` (`node_modules/@copilotkit/react-core/src/hooks/use-lazy-tool-renderer.tsx` line 15) only ever renders `message.toolCalls[0]`. When Azure OpenAI emits two tool calls in the SAME assistant message (its default behaviour for independent tool calls), only the first React component renders and the rest are silently dropped. Forcing sequential calls makes each tool land in its own assistant message, so each gets its own rich UI render. |
| **Separate Azure Function App** for the agent | Independent deploy/scale/failure-isolation from the Telegram bot. An agent rollout cannot break Telegram. The agent re-initialises any state it needs on cold start. |

### Code layout

```
f1-fantazy-bot/
├── src/
│   ├── cores/
│   │   ├── nextRacesCore.js          # pure: getNextRaces() → {season, races, counts}
│   │   ├── bestTeamsCore.js          # pure: computeBestTeams({chatId, teamId?, teamName?, rankBy?, mustInclude*, mustExclude*})
│   │   ├── userTeamsCore.js          # pure: listUserTeams({chatId}) → [{teamId, teamName, ...}]
│   │   ├── followedTeamsCore.js      # pure: listFollowedTeams({chatId}) — status-tagged
│   │   ├── leaderboardCore.js        # pure: getLeaderboard({chatId, leagueCode}) — status-tagged
│   │   ├── bestTeamScenariosCore.js  # pure: computeBestTeamScenarios({chatId, teamId?, teamName?}) — 4×4 matrix
│   │   ├── nextRaceInfoCore.js       # pure: getNextRaceInfo({onFetch?, onError?}) — cache + opportunistic weather
│   │   ├── raceWeatherCore.js        # pure: getRaceWeather({now?, onFetch?, onError?}) — hourly forecasts
│   │   ├── deadlineCore.js           # pure: getDeadlineSnapshot({now?}) — absolute timestamps for client-side countdown
│   │   ├── currentTeamCore.js        # pure: getCurrentTeam({chatId, teamId?, teamName?}) — current roster + metrics
│   │   └── liveScoreCore.js          # pure: getLiveScoreForTeam / getLiveScoreLeaderboard — validates league membership
│   ├── utils/
│   │   └── liveScoreCalc.js          # pure scoring helpers shared by liveScoreHandler + liveScoreCore
│   ├── agent/
│   │   ├── identity.js               # AGENT_HARDCODED_CHAT_ID (LLM never sees it)
│   │   ├── systemPrompt.js           # English-only v1; built once at startup
│   │   ├── tools.js                  # defineTool({ name, description, parameters: z.object({…}), execute: wrapToolExecute(…) })
│   │   ├── cacheBootstrap.js         # ensureCacheReady() — lazy initializeCaches(notifierBot) for agent process
│   │   ├── notifierBot.js            # Singleton non-polling TelegramBot for the agent process (Phase 6.1)
│   │   ├── tokenUsageMiddleware.js   # LanguageModelV3 middleware that logs per-step token usage (Phase 6.1)
│   │   ├── wrapToolExecute.js        # try/catch wrapper that returns `{status:'tool_error', errorId, ...}` (Phase 6.2)
│   │   ├── writeToolHelpers.js       # defineWriteTool + approved-intent consume/commit registry
│   │   ├── writeDecision.js          # authenticated approve/cancel application for staged writes
│   │   └── runtime.js                # BuiltInAgent + CopilotRuntime + createCopilotRuntimeHandler (+ wrapLanguageModel)
│   ├── services/
│   │   └── pendingWritesStore.js     # Azure Table-backed staged/approved intents + TTL + ETag consume
│   ├── bestTeamsCalculator.js        # exports an optional `options` arg: filters + rankBy + resultCount
│   └── commandsHandler/
│       ├── nextRacesHandler.js       # refactored: thin Telegram adapter over the core
│       ├── nextRaceInfoHandler.js    # refactored: thin Telegram adapter over nextRaceInfoCore
│       ├── nextRaceWeatherHandler.js # refactored: thin Telegram adapter over raceWeatherCore
│       ├── deadlineHandler.js        # untouched — deadlineCore is additive (agent-only entry point)
│       └── bestTeamsHandler.js       # refactored: thin Telegram adapter over the core
├── agentWebhook/
│   ├── function.json                 # httpTrigger, route `agent/{*restOfPath}`
│   └── index.js                      # Azure Functions v3 ↔ Web Request bridge
├── web/                              # Vite + React + TS + @copilotkit/react-ui
│   ├── src/
│   │   ├── App.tsx                   # <CopilotKit runtimeUrl=…> + <CopilotChat />
│   │   └── components/
│   │       ├── NextRacesTable.tsx    # useCopilotAction({ name: 'get_next_races', available: 'frontend', render })
│   │       ├── BestTeamsTable.tsx    # useCopilotAction({ name: 'get_best_teams', available: 'frontend', render })
│   │       ├── UserTeamsList.tsx     # useCopilotAction({ name: 'list_user_teams', available: 'frontend', render })
│   │       ├── FollowedTeamsGrid.tsx # useCopilotAction({ name: 'list_followed_teams', available: 'frontend', render })
│   │       ├── LeaderboardTable.tsx  # useCopilotAction({ name: 'get_leaderboard', available: 'frontend', render })
│   │       ├── BestTeamScenariosMatrix.tsx # useCopilotAction({ name: 'get_best_team_scenarios', available: 'frontend', render })
│   │       ├── RaceInfoCard.tsx      # useCopilotAction({ name: 'get_next_race_info', available: 'frontend', render })
│   │       ├── WeatherForecast.tsx   # useCopilotAction({ name: 'get_race_weather', available: 'frontend', render })
│   │       ├── DeadlineCountdown.tsx # useCopilotAction({ name: 'get_deadline', available: 'frontend', render })
│   │       ├── CurrentTeamCard.tsx   # useCopilotAction({ name: 'get_current_team', available: 'frontend', render })
│   │       ├── LiveScoreBreakdown.tsx # useCopilotAction({ name: 'get_live_score_for_team', available: 'frontend', render })
│   │       ├── LiveScoreLeaderboard.tsx # useCopilotAction({ name: 'get_live_score_leaderboard', available: 'frontend', render })
│   │       └── ToolErrorFallback.tsx # shared red-banner + isToolErrorResult() type-guard (Phase 6.2)
│   ├── package.json
│   └── …                             # own package.json — frontend deps don't pollute the backend
└── scripts/
    └── dev-agent-server.js           # local Node HTTP wrapper around agentWebhook (no `func` CLI needed)
```

### Cache bootstrap (cross-process)

The Telegram bot's `src/bot.js` runs `initializeCaches(bot)` at startup so every command handler can read from `driversCache`, `currentTeamCache`, etc. The agent runs in a **separate process** (its own Azure Function App) and therefore has its own empty in-memory caches — they MUST be populated before any tool that reads them can run.

`src/agent/cacheBootstrap.js` exports `ensureCacheReady()`: it lazily calls `initializeCaches(getNotifierBot())` once per process. The notifier bot (introduced in Phase 6.1, see [Token usage logging](#token-usage-logging-phase-61)) is a singleton **non-polling** `TelegramBot` instance — when `TELEGRAM_BOT_TOKEN` is set, cache-init logs land in the same Telegram `LOG_CHANNEL_ID` the main bot uses; otherwise it's a noop and logs stay on stdout. The promise is cached for reuse; on failure it resets so the next tool call retries from scratch (transient Azure errors don't brick the agent for the lifetime of the process).

Tools that need caches MUST `await ensureCacheReady()` before reading from `currentTeamCache`/`driversCache`/etc.:

```js
execute: async (args) => {
  await ensureCacheReady();
  const chatId = getAgentChatId();
  return await computeBestTeams({ chatId, ...args });
},
```

Tools that don't need caches (e.g. `get_next_races` calls Ergast directly) can skip the await.

> **Caveat:** `initializeCaches` also runs `refreshLeagueSourcedTeams`, which can `saveUserTeam` back to Azure Storage. The agent process needs the same Azure Storage credentials the bot does, and league refreshes happen idempotently on both sides — this is intentional but worth knowing during deployment.

### Tool definitions

Tools live in `src/agent/tools.js` and use `defineTool` from `@copilotkit/runtime/v2`:

```js
const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { getNextRaces } = require('../cores/nextRacesCore');

const tools = [
  defineTool({
    name: 'get_next_races',
    description: 'Get the list of upcoming F1 races for the current season. Returns season, an array of race objects, and counts {total, sprint}.',
    parameters: z.object({}),         // empty schema is fine for no-arg tools
    execute: async () => getNextRaces(),
  }),
];
```

The `execute` handler MUST call into a pure core in `src/cores/*` — handlers must not import `bot`, `t()`, or anything Telegram-specific. The chatId, when needed, comes from `getAgentChatId()` in `src/agent/identity.js` (passed by the runtime context, never from LLM-controlled arguments).

### Rich UI render registration

Each tool that needs a custom React rendering registers a frontend "render" via `useCopilotAction`:

```jsx
useCopilotAction({
  name: 'get_next_races',
  description: '…',
  parameters: [],
  available: 'frontend',              // ← MANDATORY for render-only backend tools
  render: ({ status, result }) => {
    if (status === 'inProgress' || status === 'executing') return <Spinner />;
    const parsed = typeof result === 'string' ? safeParse(result) : result;
    return <NextRacesTable result={parsed} />;
  },
});
```

> **Pitfall (don't repeat):** without `available: 'frontend'`, CopilotKit's `getActionConfig` throws `Invalid action configuration` and the whole React tree crashes blank. The marker tells CopilotKit "this is render-only for a backend-executed tool".

> **Pitfall (Phase 2):** if you don't disable parallel tool calls (`providerOptions: { openai: { parallelToolCalls: false } }` on the `BuiltInAgent`), Azure OpenAI is free to emit multiple tools in the SAME assistant message — and CopilotKit's `useLazyToolRenderer` only renders `toolCalls[0]`. You'll see ONE of N tool results render and the rest silently disappear from the UI (the LLM's text reply will still describe them correctly, just no rich component). Fix: keep parallel calls disabled in `src/agent/runtime.js`.

> **Pitfall (Phase 5):** the `useLazyToolRenderer` "only renders `toolCalls[0]`" rule also means a multi-call clarify-then-fetch flow inside ONE turn drops the second tool's UI. We learned this with live-score: the agent should NOT call `list_league_teams` and then `get_live_score_for_team` in the same turn. The clarify-and-focus pattern: **ask which league → wait for the user → ask which team in that league → wait again → call `get_live_score_for_team` ONCE with both `leagueName` and `teamName`.** The system prompt enforces this and the live-score tool's description spells it out — keep it that way when adding similar two-arg lookup tools.

> **Pitfall (Phase 5):** the `liveScoreCore` lesson — for cross-league live-score, do NOT auto-default to the user's `selectedTeam`. A user can be in multiple leagues with different team names; auto-pick produces "I can't find that team" errors when the resolved teamId belongs to a different league. The right pattern is to ASK which league and team, then call the tool with both. The tool's `team_not_found` status returns an `availableTeams` array specifically so the LLM can re-ask.

> **Pitfall (Phase 3 + Phase 5 — recurring):** the system prompt is a **template literal** in `src/agent/systemPrompt.js`. Any literal backtick inside the prompt must be escaped (`` \` ``) — an unescaped backtick terminates the template literal early and turns the rest of the prompt into syntactically-invalid JavaScript (cryptic "Unexpected identifier" errors on require). Phase 3 and Phase 5 both hit this. When you add new tool guidance with code-like fragments, prefer single-quotes (`'tool_error'`) over backticks where possible.

### Token usage logging (Phase 6.1)

The agent emits a per-step token-usage log line for every LLM call. The Telegram `/ask` command has done this since day one; the web-chat agent reaches the same observability via an **AI SDK middleware** attached at the `wrapLanguageModel` boundary. CopilotKit v2's `BuiltInAgent` does NOT expose an `onFinish` or `onStepFinish` hook, so the middleware seam is the only stable place to observe usage.

```
src/agent/runtime.js
  ↓
buildAzureLanguageModel(cfg)  ─→ Azure LanguageModelV3
  ↓
wrapLanguageModel({ model, middleware: createTokenUsageMiddleware({ bot }) })
  ↓
BuiltInAgent({ model: wrapped, … })
```

The middleware (`src/agent/tokenUsageMiddleware.js`) implements `wrapStream` and pipes every chunk through a `TransformStream`. On each `finish` chunk it logs:

```
BOT: Agent step usage — model: gpt-4o, step: 1, prompt: 120, completion: 30, total: 150
env: prod
pid: 12345
```

**Key gotchas:**

- **V3 usage shape is NESTED.** A `LanguageModelV3StreamPart` of type `finish` carries `usage.inputTokens.total` and `usage.outputTokens.total` (NOT the V2 flat `promptTokens` / `completionTokens`). There is no aggregated `totalTokens` in V3 — we compute it locally. Any of these fields may be `undefined`; we substitute 0 so the log line still renders cleanly.
- **Per-step, not per-turn.** A single agent turn with N tool calls produces up to N+1 `finish` chunks (one per LLM step). We log each — true per-turn aggregation would require factory mode and is deferred. The log line includes a `step: K` label so you can correlate.
- **Logging is fire-and-forget.** The send is wrapped in BOTH a sync try/catch AND an `.catch()` on the returned promise so a Telegram outage cannot break the LLM stream piping back to the browser. Worst case: the user gets their answer, the log line lands in stderr instead of Telegram.
- **Notifier bot is non-polling.** `src/agent/notifierBot.js` instantiates `new TelegramBot(token, { polling: false })` so the agent process never conflicts with the main Telegram bot process that owns the long-polling loop on the same token. Telegram allows N senders on one token; only one poller is allowed. Falls back to a noop if `TELEGRAM_BOT_TOKEN` is unset (so local dev without Telegram still works).

### Tool error handling (Phase 6.2)

When any agent tool throws, the user sees a friendly red banner in the web chat — never a raw error string. Azure error messages routinely include URLs, container names, request IDs, SAS tokens, and full stack traces; **we MUST NOT expose these to the UI.**

```
agent tool throws
        ↓
wrapToolExecute(name, fn) catches → generates 8-char errorId (slice of randomUUID())
        ↓
   ┌── full err + errorId → sendErrorMessage(notifierBot, …) → ERRORS_CHANNEL_ID
   │   (try/catched — telegram outage cannot break the tool path)
   ↓
{ status: 'tool_error', tool, errorId, userMessage } → LLM + UI
        ↓
   ┌── system prompt: surface userMessage, no auto-retry, no fabrication, no errorId exposure
   ↓
   <ToolErrorFallback result={parsed} /> → red banner + collapsed support details (tool + errorId)
```

**Pieces:**

- **`src/agent/wrapToolExecute.js`** — `wrapToolExecute(toolName, fn)` returns a wrapped `execute` that try/catches `fn(args)`. On throw: routes the full technical error (including stack) to `ERRORS_CHANNEL_ID` and returns `{ status: 'tool_error', tool, errorId, userMessage }` to the LLM/UI. The notifier-send is itself try/catched so a Telegram outage cannot break the tool dispatch.
- **All 14 tools in `src/agent/tools.js` are wrapped** via this helper. Two tools without rich UI components (`list_user_leagues`, `list_league_teams`) still benefit — their `tool_error` result is narrated by the LLM via the system-prompt rule.
- **`web/src/components/ToolErrorFallback.tsx`** exports `<ToolErrorFallback />` and `isToolErrorResult()`. All 12 render hooks add a three-line short-circuit right after `safeParse`:
  ```tsx
  const parsed = typeof result === 'string' ? safeParse(result) : result;
  if (isToolErrorResult(parsed)) {
    return <ToolErrorFallback result={parsed} />;
  }
  return <RealComponent result={parsed} />;
  ```
- **System prompt rule:** if a tool returns `status: 'tool_error'`, briefly apologize, surface the `userMessage`, suggest retry. **DO NOT** retry the same tool with the same args unless the user explicitly asks. **DO NOT** invent or fabricate data. **DO NOT** mention the `errorId` unless the user asks for a support reference.

**Secret-redaction policy (don't relax this):**

- The user-facing return value of `wrapToolExecute` MUST NOT include `err.message` or any derived form of the original error. The 8-char `errorId` is the only correlation surface the user sees.
- There is a regression test in `wrapToolExecute.test.js` titled _"NEVER includes the raw technical message in the returned user-facing result"_ that asserts URLs / SAS tokens / `sig=` query params cannot leak into the serialized result. **Do not weaken this test** — it's the guard rail that catches a future contributor who tries to "be helpful" by passing `err.message` to the UI.
- The full error (with stack) DOES go to `ERRORS_CHANNEL_ID` so on-call has everything they need to debug; the channel is private. The `errorId` is the same in both places, so support → channel correlation is one grep.

### Write-tool confirmation infrastructure

Agent writes use a two-step propose/confirm protocol, but **the model's
possession of a nonce is not authorization**:

1. `defineWriteTool(...)` validates a proposal and stores a serializable
   intent in Azure Table `PendingAgentWrites` with
   `{ partitionKey: chatId, rowKey: nonce, state: 'staged', tool, args,
   summary, expiresAt }`. No mutation runs.
2. `<WriteConfirmCard>` shows Yes / Cancel. The button calls the exact
   authenticated webhook route `/api/agent/write-decision`; it runs the
   same Google token + allowlist pipeline as CopilotKit traffic.
3. **Yes** changes the matching chat-owned row to `approved` using its
   ETag. Only after that succeeds does the UI append the nonce-bearing
   user message that lets the model call `confirm_write`.
4. **Cancel** deletes the row immediately and appends a nonce-free
   cancellation message.
5. `confirm_write` returns `forbidden` for a staged row. For an approved
   row it performs an ETag-protected delete; only the Function instance
   that wins that atomic single-use consume may invoke the registered
   commit handler.

The durable table is required because proposal and confirmation are
separate HTTP turns: Azure Functions Consumption may route them to
different workers or recycle the first worker. Commit functions remain
process-local code in `WRITE_TOOL_REGISTRY`; the table stores only
`tool` + JSON args and resolves the handler by tool name after consume.

Expired rows are rejected on every point lookup and removed by a
throttled table sweep started by new proposals. Never replace this with
a module-level Map or rely on the system prompt's “never auto-confirm”
instruction as the security boundary.

Key files:

- `src/services/pendingWritesStore.js` — durable staging, approval,
  cancellation, TTL sweep, ETag consume.
- `src/agent/writeToolHelpers.js` — `defineWriteTool` and commit
  registry.
- `src/agent/writeDecision.js` + `agentWebhook/index.js` — authenticated
  decision endpoint.
- `web/src/components/WriteDecisionContext.tsx` — decision HTTP client
  and provider.
- `web/src/components/WriteConfirmCard.tsx` — server decision first,
  then chat message.
- `docs/agent-write-tools-plan.md` — per-write-tool rollout.

### Environment variables

| Var | Required for | Purpose |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Agent | Azure OpenAI host (works for both `*.openai.azure.com` and `*.services.ai.azure.com`). |
| `AZURE_OPENAI_API_KEY` | Agent | Azure OpenAI auth. |
| `AZURE_OPEN_AI_MODEL` | Agent + Telegram `/ask` | Deployment name (used by `azure.chat(deployment)`). |
| `AGENT_HARDCODED_CHAT_ID` | Agent | Fallback identity used when no per-request context is active (local dev + cache bootstrap). On Azure-deployed slots both prod + test set `GOOGLE_CLIENT_ID`, so the hardcoded path is unreachable from user traffic — it survives as a local-dev fallback only. The LLM never sees it. Defaults to `KILZI_CHAT_ID` in `scripts/dev-agent-server.js` if absent. |
| `GOOGLE_CLIENT_ID` | Agent | OAuth 2.0 Web client ID. NOT a secret — safe in app settings. Set on BOTH Azure slots (production + test). When the agent webhook sees a valid bearer it enforces Google sign-in + allowlist lookup on every POST. When unset (local dev only), auth is bypassed and `AGENT_HARDCODED_CHAT_ID` is used instead. |
| `AGENT_REQUIRE_ADMIN` | Agent | `"true"` on the test slot only — adds an admin-only filter after the allowlist check (admins = `KILZI_CHAT_ID` / `DORSE_CHAT_ID` from `src/constants.js`). `"false"` / unset on prod. See [Web auth → Test-slot admin-only gate](#test-slot-admin-only-gate). |
| `VITE_GOOGLE_CLIENT_ID` | SWA build env | Same client ID, baked into the bundle by both the prod SWA workflow AND the PR/staging workflow. Unset at build time = chat renders without auth gate (local dev only). |
| `LOG_ENV` | Agent + Telegram | Optional log label override used by `sendLogMessage` / `sendErrorMessage`. Agent infra sets it to `production` on the prod slot and `test` on the test slot while keeping `NODE_ENV=production` for runtime behavior. |
| `TELEGRAM_BOT_TOKEN` | Agent (optional) | If set, the agent's notifier bot sends token-usage + tool-error logs to the same Telegram channels the main bot uses. On Azure this is wired by `infra/agent-func/apply-settings.sh` from KV secret `telegram-bot-token` on both slots. If unset, logs stay on stdout — local dev without Telegram still works. |
| `LOG_CHANNEL_ID` | Telegram bot | Token-usage logs land here from BOTH processes when their notifier bots have a Telegram token. Set in `src/constants.js`. |
| `ERRORS_CHANNEL_ID` | Telegram bot | Tool errors with `errorId` land here. Set in `src/constants.js`. |
| `<other Azure Storage creds>` | Agent + Telegram | Cache init reads (and occasionally writes) league rosters from Azure Storage — same creds the bot uses. |

### Identity model

The agent acts as a **per-request chatId** propagated through Node's
`AsyncLocalStorage`. Resolution order inside `getAgentChatId()`
(`src/agent/identity.js`):

1. **Request context** set by `runWithRequestContext({ chatId, email,
   sub }, fn)` (`src/agent/requestContext.js`). The agent webhook
   verifies the caller's Google ID token (see [Web auth](#web-auth)),
   looks the email up in the `WebUserAllowlist` Azure Table, then
   wraps the entire CopilotKit runtime invocation in that scope. Every
   tool's `execute(args)` reads from `getRequestContext()` indirectly
   via `getAgentChatId()` — the LLM never sees `chatId` or `email` in
   its `args`.
2. **`AGENT_HARDCODED_CHAT_ID` env var** — used by local dev
   (`scripts/dev-agent-server.js`) and by background paths that run
   outside an HTTP request (e.g. `cacheBootstrap`). Both Azure-deployed
   slots (production + test) now run the Google auth gate, so the
   hardcoded path is no longer reachable from real user traffic on
   Azure — it survives as a local-dev fallback only.
3. **Throw** — neither available; tools cannot proceed without an
   identity.

The LLM **never** sees or controls the resolved chatId/email — those
are derived from a token the LLM cannot manufacture. This blocks
prompt injection from escalating to "act as another user".

### Web auth

The web chat at `https://f1.kilzid.com` is gated by **Google Sign-In**
(via `@react-oauth/google` on the frontend and `google-auth-library`
on the backend). Anonymous visitors see only the login screen — no
chat UI is mounted.

**Flow:**

```
browser
  │  <GoogleLogin /> → ID token (JWT)
  │  AuthContext caches token in sessionStorage (NOT localStorage —
  │  closes tab = sign out)
  │  <CopilotKit headers={() => ({ Authorization: `Bearer …` })}>
  │  useAuthFetchInterceptor watches window.fetch for 401s from
  │  RUNTIME_URL → on 401 calls setRejection() + signOut()
  ▼
agentWebhook/index.js
  │  authenticateRequest(req, { lookupAllowedUser })
  │    ├── extracts Bearer
  │    ├── verifies via google-auth-library (aud, iss, email_verified)
  │    └── looks up the lowercased email in `WebUserAllowlist`
  │  status → HTTP:
  │    OK         → runWithRequestContext({ chatId, email, sub }, …)
  │    BYPASSED   → falls through (GOOGLE_CLIENT_ID unset; local dev only)
  │    UNAUTHORIZED → 401 + JSON { error, reason }
  │    FORBIDDEN  → 401 + JSON { error, reason, email }
  ▼
CopilotKit → BuiltInAgent → tool execute()
  ▼
getAgentChatId() reads ALS context → the right user's data
```

**Backend bypass (local-dev only):** when `GOOGLE_CLIENT_ID` is unset
on the Function App, `authenticateRequest` returns `BYPASSED` and the
webhook falls through to the legacy hardcoded-chatId path. In Azure,
both slots now set `GOOGLE_CLIENT_ID` (production + test), so
`BYPASSED` is only reachable from local dev (`scripts/dev-agent-server.js`,
where the env var is intentionally absent). The frontend mirrors the
bypass: when `VITE_GOOGLE_CLIENT_ID` is empty at build time, the
login screen is skipped entirely (local dev only).

**Allowlist storage (`src/webUserAllowlistService.js`):** Azure Table
`WebUserAllowlist`, single partition `'WebUser'`. RowKey is the
**lowercased email** (case-insensitive lookups). Schema:

| Field          | Notes                                                       |
| -------------- | ----------------------------------------------------------- |
| `partitionKey` | always `'WebUser'`                                          |
| `rowKey`       | lowercased Google email                                     |
| `chatId`       | mapped Telegram chatId (required for v1; optional later)    |
| `addedBy`      | admin chatId that added the entry                           |
| `addedAt`      | ISO timestamp                                               |

Until the agent has its own write actions, every allowlisted email
MUST map to an existing Telegram `chatId` so the agent can serve that
user's existing Telegram-side data (teams, leagues, live score, …).
Once write actions land, this `chatId` field becomes optional and
the email alone becomes the agent's identity.

**Admin tooling (Telegram bot):** three new admin commands manage the
allowlist via the existing Pending Reply Manager:

- **`/allow_web_user`** — two-step flow:
  1. Admin enters the Google email (validated by basic regex shape).
  2. Admin enters the target chat ID (validated against `UserRegistry`).
  3. Bot writes the allowlist row and confirms with
     `{nickname || chatName} ({chatId})`.
- **`/revoke_web_user`** — single-step: admin enters the email, bot
  deletes the row. No-op (with friendly message) when the email
  isn't on the allowlist.
- **`/list_web_users`** — no reply; bot renders the full allowlist as
  Markdown, joined against `UserRegistry` so admins see the linked
  nickname/chatName for each row.

**Environment variables (auth-specific):**

| Var                     | Where               | Notes                                                                                                                                       |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | Agent Function App  | OAuth 2.0 Web client ID. NOT a secret — safe in app settings. Set on BOTH slots in Azure (production + test). Unset = bypass mode (local dev only). |
| `AGENT_REQUIRE_ADMIN`   | Agent Function App  | `"true"` on the test slot (admin-only filter — see [Test-slot admin-only gate](#test-slot-admin-only-gate)). `"false"` / unset on production. |
| `VITE_GOOGLE_CLIENT_ID` | SWA build env       | Same client ID, baked into the bundle at build time by both the prod workflow (`main_f1-fantazy-agent-web.yml`) AND the PR/staging workflow (`pr_test_f1-fantazy-agent-web.yml`). Unset at build time = chat renders without auth gate (local dev only). |

**Google Cloud Console setup (one-time):** create an OAuth 2.0 Web
client. Authorized JavaScript origins must include:

- Production SWA: `https://f1.kilzid.com` + the raw hostname
  `https://calm-beach-055be4603.7.azurestaticapps.net`.
- Test SWA (PR validation): `https://test.f1.kilzid.com` + the raw
  hostname `https://proud-sky-035c6b003.7.azurestaticapps.net`.

Both SWAs use the SAME OAuth client (one client ID, one consent
screen). See [Test-slot admin-only gate](#test-slot-admin-only-gate)
for why we use one fixed `test.f1.kilzid.com` URL instead of
per-PR ephemerals.

#### Test-slot admin-only gate

The test slot of the agent Function App is fully Google-gated AND
additionally locked to admin chatIds (`KILZI_CHAT_ID`,
`DORSE_CHAT_ID` — same set `isAdminMessage` uses). This blocks
drive-by abuse and cost-exfiltration on the publicly-reachable
preview URL.

**How it works:**

- `AGENT_REQUIRE_ADMIN=true` is set on the test slot (via
  `infra/agent-func/apply-settings.sh`). On prod it's `"false"`.
- `src/agent/auth.js` evaluates `process.env.AGENT_REQUIRE_ADMIN === 'true'`
  AFTER the standard allowlist + valid-chatId checks succeed. Only
  the literal string `"true"` enables the gate — defensive against
  typos in app settings.
- Non-admin allowlisted users on the test slot resolve to
  `{ status: FORBIDDEN, reason: 'not_admin', email }` → `401` to the
  client. The frontend's existing rejection-screen path renders this
  the same way as `email_not_allowlisted`.
- Admin definition lives in `src/constants.js`
  (`KILZI_CHAT_ID = 454873194`, `DORSE_CHAT_ID = 673447790`). The
  env var doesn't carry a chatId list — keeping one source of truth
  for "admin" between the Telegram bot and the agent.
- Gate ordering is intentional: the allowlist + chatId validity
  checks run FIRST, so a non-allowlisted admin still gets the
  generic `email_not_allowlisted` response (no info leak about admin
  identity).

**Why a dedicated `test.f1.kilzid.com` SWA instead of a `staging`
environment on the prod SWA?** Google's OAuth 2.0 Web client requires
every Authorized JavaScript origin to be a fixed URL — wildcards are
not supported. Maintaining a list of per-PR hostnames in GCP Console
doesn't scale, so all PR builds publish to **a single fixed URL**.
Custom domains on non-production SWA environments require Standard
SKU (~$9/mo), so we provisioned a second Free-SKU SWA
(`f1-fantazy-agent-web-test`, `infra/agent-web-test/`) dedicated to
PR validation. Its `default` (production) environment IS the staging
surface — no per-PR ephemerals, no environment-flag tricks. The
trade-off — only one PR can be visually tested at a time — is
acceptable for a small dev team and is documented at the top of
`.github/workflows/pr_test_f1-fantazy-agent-web.yml`.

**Test slot operational notes:**

- The slot stays **Running** by default. Pre-auth it used to be
  kept Stopped as a security workaround (anyone with the URL could
  drive the agent as the owner); with Google sign-in +
  `AGENT_REQUIRE_ADMIN=true` in place, that workaround is no longer
  needed. The App Service Plan is Y1 Consumption — pay-per-execution
  — so an idle Running slot costs effectively $0, and PR validation
  becomes a single deploy → test loop with no manual `az functionapp
  start` round-trip.
- The PR workflow (`pr_test_f1-fantazy-agent-func.yml`) still
  tolerates the slot being Stopped during deploy via
  `continue-on-error: ${{ steps.state_check.outputs.state == 'Stopped' }}`
  — kept as a safety net if someone stops it manually. The
  `WEBSITE_RUN_FROM_PACKAGE` setting + the package upload succeed
  even when stopped; only Sync Trigger fails cosmetically. The latest
  code loads automatically on the next `az functionapp start --slot test`.
- A stopped slot returns Azure's "Web App stopped" `HTTP 403` page
  to all callers before reaching our code — strictly stronger than
  the 401 the auth gate would return. Either state is safe; Running
  is just more ergonomic.

**Rollout sequence (executed 2026-05-22; documented for the record):**

1. Backend code: add `AGENT_REQUIRE_ADMIN` env-var support to
   `src/agent/auth.js` + tests in `src/agent/auth.test.js`. (PR #204)
2. Frontend: no source changes needed — existing Google sign-in
   flow works because the OAuth client ID and the `WebUserAllowlist`
   Azure Table are shared with prod.
3. (Original Strategy A) Materialize a `staging` environment on the
   prod SWA via SWA CLI; deploy PR builds there. Worked but couldn't
   get a custom domain on Free SKU. (PR #204 + PR #205 follow-up)
4. (Option B — current model) Provision a dedicated test SWA
   `f1-fantazy-agent-web-test` (`infra/agent-web-test/`), bind
   `test.f1.kilzid.com` to its default environment. Rewrite the PR
   workflow to deploy to the test SWA via a separate GH secret
   `AZURE_STATIC_WEB_APPS_API_TOKEN_TEST`. Decommission the original
   `staging` environment on the prod SWA.
5. Allowlist updates for new origins (`https://test.f1.kilzid.com`,
   raw test-SWA hostname) added in the prod OAuth client.
6. Test slot CORS pinned to the two test origins via
   `infra/agent-func/apply-settings.sh` + `azuredeploy.parameters.json`.
7. End-to-end verified: anonymous → 401, signed-in admin → works on
   `test.f1.kilzid.com`, PR auto-comment posts the right URL.

**Token observability:** the Phase 6.1 token-usage middleware reads
`getRequestContext()?.email` and appends `, email: <user>` to every
per-step log line, so on-call can correlate Telegram log spikes to a
specific user.

#### Verification (whoami) — the gate is fail-closed

Google sign-in only proves the caller has a Google account. The
backend allowlist is the actual authorization layer. To avoid
"backend down → user gets into the chat anyway", the frontend runs a
pre-flight `GET /api/agent/whoami` BEFORE mounting `<CopilotKit>` /
the chat tree.

**Endpoint** (`agentWebhook/index.js`): same Azure Function, same
route; dispatched by exact `pathname === '/api/agent/whoami'`. Runs
the same `authenticateRequest` pipeline as the chat path but NEVER
invokes CopilotKit. Returns:

- `200 { status: 'ok', mode: 'authenticated', email, name }` on hit
- `200 { status: 'ok', mode: 'bypassed' }` when `GOOGLE_CLIENT_ID` is
  unset (preserves local-dev parity)
- `401 { error, reason, email? }` on rejection — same body shape as
  the chat path
- `405` on non-GET / non-OPTIONS verbs

**Frontend** (`web/src/auth/`):

- `whoami.ts` — `verifyAccess(idToken, runtimeUrl)`. Pure helper.
  3 attempts max with exponential backoff (300 / 900 / 1800 ms) and
  an `AbortController` 8 s timeout per attempt. Retries only
  transient failures (network / timeout / 408 / 429 / 5xx). **Never
  retries 401** — that's a definitive rejection. Returns a
  discriminated union `{status: 'ok' | 'forbidden' | 'unavailable'}`.
- `AccessVerifier.tsx` — wraps the chat subtree. On `ok` → render
  children. On `forbidden` → `signOut()` + `setRejection` → login
  screen reappears with the right reason. On `unavailable` →
  "Agent unavailable, Retry" card with the session preserved.

**The fail-closed UX rule:**

| Result        | Frontend behaviour                       | Why                                                                                              |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ok`          | mount the chat                           | User is verified.                                                                                |
| `forbidden`   | sign out → login screen with rejection   | 401 is definitive.                                                                               |
| `unavailable` | "Retry" card, **session preserved**      | Cold-start blips / outages → bouncing to sign-in creates a loop the user can't escape. Stay in a recoverable state with the chat hidden. |

**One-line contract: backend unreachable = no chat.** The chat tree
is NEVER mounted on `verifying` or `unavailable`. The chat-history
scope (`setHistoryScope`) is bound INSIDE the verified subtree only,
so an unauthorized user never even touches `localStorage`.

**Security-regression test:** `web/src/auth/whoami.test.ts` pins the
invariant that a failing / unreachable backend NEVER resolves to
`status: 'ok'` — including the edge cases where the server returns
200 with an unexpected body shape or non-JSON content. Do not weaken
those assertions; they are the guard rail for the original bug.

### Cores ↔ Telegram-adapter pattern

This is the cross-phase invariant. For every capability that needs to be on **both** surfaces:

1. Extract the pure logic into `src/cores/<feature>Core.js` — returns structured JSON, no `bot`, no `t()`, no `sendMessage`.
2. Refactor the existing Telegram handler in `src/commandsHandler/<feature>Handler.js` into a thin adapter: call the core, format the result for Telegram, `bot.sendMessage`. **External behavior must stay byte-identical** — existing handler tests must keep passing unchanged. If a test breaks, the refactor changed behavior; fix the refactor, not the test.
3. Wrap the same core in an agent tool via `defineTool` in `src/agent/tools.js`.
4. If the agent should render the result as a custom component, add a `<FooComponent />` in `web/src/components/` and register it via `useCopilotAction({ name, available: 'frontend', render })`.

### Local dev workflow

```bash
# .env must already include AZURE_OPENAI_ENDPOINT/AZURE_OPENAI_API_KEY/AZURE_OPEN_AI_MODEL
# AGENT_HARDCODED_CHAT_ID is set by scripts/dev-agent-server.js to KILZI_CHAT_ID
# if absent.

npm install
cd web && npm install && cd ..

npm run dev          # both at once via `concurrently`
# or:
npm run dev:agent    # only agent dev server on :7071
npm run dev:web      # only Vite frontend on :5173/:5174
```

`scripts/dev-agent-server.js` is the dev wrapper around `agentWebhook/index.js` — it loads `.env`, wraps the same handler in a plain Node HTTP server, and lets us exercise the full pipeline without installing Azure Functions Core Tools (`func`).

### Adding a new tool (checklist)

1. **Extract the core** at `src/cores/<feature>Core.js`. Pure function, structured JSON return.
2. **Refactor the matching Telegram handler** to call the core. Run `npx jest <handler>.test.js` — must pass unchanged.
3. **Add the tool** to `src/agent/tools.js` via `defineTool({ name, description, parameters: z.object({…}), execute: wrapToolExecute('<tool_name>', async (args) => { … }) })`. **The `execute` MUST be wrapped via `wrapToolExecute` from `src/agent/wrapToolExecute.js`** (Phase 6.2) — this gives the tool friendly UI errors with an opaque `errorId` instead of leaking raw Azure error strings. The wrapper is transparent on success. If `chatId` is needed, use `getAgentChatId()` from `src/agent/identity.js`. **If the core reads from `currentTeamCache`/`driversCache`/etc, `await ensureCacheReady()` first** (see [Cache bootstrap](#cache-bootstrap-cross-process)).
4. **Update the system prompt** in `src/agent/systemPrompt.js` if the new tool requires guidance (e.g. "if the user names a team in a 'best teams' question, call get_best_teams directly with `teamName` — don't pre-call list_user_teams; the multi-step routing costs latency and only one rich UI component can render per assistant turn"). **Escape any literal backticks inside the prompt** — an unescaped backtick terminates the template literal early and breaks `require('./systemPrompt')`. Prefer single-quotes for code-like fragments (`'tool_error'`) over backticks where possible.
5. **Build the React component** at `web/src/components/<Feature>.tsx`. Define it inside a `useCopilotAction({ name, available: 'frontend', render })` hook (the hook must run inside a component mounted under `<CopilotKit>`). Match `name` exactly to the backend tool's name; for `available: 'frontend'` actions the `parameters` array is metadata-only — keep it as `[]` to avoid TypeScript / shape-matching issues with CopilotKit's frontend tooling. **Inside the `render` callback, after `safeParse`, add the shared error fallback short-circuit:**
   ```tsx
   import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
   // …
   const parsed = typeof result === 'string' ? safeParse(result) : result;
   if (isToolErrorResult(parsed)) {
     return <ToolErrorFallback result={parsed} />;
   }
   return <RealComponent result={parsed} />;
   ```
   The fallback is shared across all 12 components — do not duplicate the JSX.
6. **Wire the hook** by importing and calling it from `web/src/App.tsx` (or wherever the `<AgentActions />` component lives).
7. **Tests:** unit-test the core in `src/cores/<feature>Core.test.js`. Unit-test the tool's JSON shape if non-trivial. Re-run the full Telegram suite — must stay green.
8. **Verify in-browser with Playwright MCP.** The browser is the source of truth for UI changes — every UI change must be Playwright-verified before declaring "done".

### Chat-history persistence (Phase 6.5)

The web chat persists conversation text to `localStorage` so a page
refresh doesn't wipe the visible history. The persistence layer is
client-only and intentionally narrow — see
`web/src/lib/chatHistoryStore.ts` for the contract:

- Only `role: 'user' | 'assistant'` messages with a non-empty text
  `content` survive. Tool calls / tool results / large blobs are
  NEVER persisted (no reloading stale tool data into the LLM, no
  bloating the per-origin localStorage quota).
- Caps: 20 messages, 100 KB total payload, 8 KB per message. Oldest
  messages are trimmed first.
- Storage key is scoped per Google `sub` when the user is signed in
  (`f1-fantasy-agent-history::<sub>`) and falls back to the
  unscoped key in local-dev / un-authed mode.

**Why restore is reconciliation-based, not one-shot.** CopilotKit v2
hands `useAgent()` a `ProxiedCopilotRuntimeAgent` in "pending" mode
before the runtime connects. Once the runtime connects, it syncs an
**empty** initial state (we run in single-route mode without
server-side `/threads`), which fires `onMessagesChanged({ messages:
[] })` AFTER our first `setMessages(stored)` call — clobbering the
restore. A naive one-shot restore therefore loses the user's
history on every reload because the debounced save then writes `[]`
over the stored payload.

`HistoryRestorer` (`web/src/components/HistoryRestorer.tsx`) avoids
this with **two cooperating invariants**, NOT a one-shot:

1. **Restore only into an empty, idle agent.** The restore effect
   re-runs on every `messageVersion` bump (driven by a direct
   `agent.subscribe({ onMessagesChanged })` subscription so we react
   to in-place mutations too) and re-applies `setMessages(stored)`
   whenever `agent.messages.length === 0` AND `load().length > 0`
   AND `!agent.isRunning`. A small per-agent fuse
   (`MAX_RESTORE_ATTEMPTS_PER_AGENT = 5`) bounds the self-heal so a
   future CopilotKit change that re-syncs repeatedly can't pin a
   CPU at 100%.
2. **Never overwrite a non-empty stored history with `[]`.** The
   debounced save guards with `if (next.length === 0 &&
   load().length > 0) return;` — so the transient runtime-clobber
   window can't reach localStorage. The legitimate clear path
   (`ClearHistoryButton` calls `clear()` BEFORE
   `agent.setMessages([])`) sees `load().length === 0` and proceeds
   with the empty save.

The history scope (`setHistoryScope(sub)`) is bound **synchronously
during render** of `<VerifiedAgentChat>`, not in a `useEffect` —
React runs child effects before parent effects, so a parent-effect
bind would let `<HistoryRestorer />`'s first read observe an
unscoped or stale key.

When adding features that touch the chat tree, you generally don't
need to touch this code. If you do, the rule to keep in mind is:
**the agent's `messages` array is not the source of truth across
reloads — `localStorage` is.** Anything that intentionally drops
messages must go through `clear()` first, then through
`agent.setMessages([])`.

### Known issues / deferred

- **Token-usage logging** is wired in Phase 6.1 — see [Token usage logging](#token-usage-logging-phase-61). Logs land in stdout always, and in `LOG_CHANNEL_ID` when `TELEGRAM_BOT_TOKEN` is set.
- **Tool-error UX** is wired in Phase 6.2 — see [Tool error handling](#tool-error-handling-phase-62). Full errors go to `ERRORS_CHANNEL_ID`; users see a friendly banner with an opaque `errorId`.
- **405s on `/threads?agentId=default`** in the browser console are CopilotKit polling for chat-history persistence routes that don't exist in single-route mode. Harmless — we run Phase 6.5 client-side via `localStorage` (see [Chat-history persistence](#chat-history-persistence-phase-65)) so the runtime doesn't need a `/threads` backend.
- **SSE streaming on Azure Functions Consumption plan** is unverified — locally the bridge buffers the full response. If streaming flushing turns out to be flaky on Consumption, fall back to non-streaming JSON or upgrade to Premium. Deferred along with deployment.
- **CORS** is currently permissive (`Access-Control-Allow-Origin: *`). CORS hardening is deferred until frontend deployment unparks.
- **Hebrew localisation** of agent outputs is out of v1 scope. The Telegram bot stays bilingual.
- **Multi-tool-call rendering**: CopilotKit's `useLazyToolRenderer` only renders `message.toolCalls[0]`. We force sequential tool calls via `parallelToolCalls: false`. If a future tool needs to fan out (e.g., "best teams for every team I track"), it has to do so server-side inside one `execute` and return a list — the LLM cannot emit N parallel tool calls and expect N React renders. The clarify-and-focus pattern (ask once, call once) is the established workaround for two-arg lookups like live-score.

### Key files

| File | Role |
|---|---|
| `src/cores/<feature>Core.js` | Pure logic core, returned JSON only. |
| `src/cores/bestTeamsCore.js` | `computeBestTeams({chatId, teamId?, teamName?, rankBy?, mustInclude*, mustExclude*})` — status-tagged result, normalises codes via `NAME_TO_CODE_MAPPING`, returns `unknown_filter` when a name can't be resolved. |
| `src/cores/userTeamsCore.js` | `listUserTeams({chatId})` — array of `{teamId, teamName, isLeague, isSelected, chip, …}`. |
| `src/cores/followedTeamsCore.js` | `listFollowedTeams({chatId})` — status-tagged. Returns `{ status: 'ok', teams: [{ teamId, teamName, leagues: [{leagueCode, leagueName, position}], isSelected }] }` deduplicated by teamId across followed leagues; `status: 'empty'` when the user has no league teams. |
| `src/cores/leaderboardCore.js` | `getLeaderboard({chatId, leagueCode})` — status-tagged (`ok` / `not_followed` / `not_found` / `invalid_input`). Returns `{ leagueCode, leagueName, memberCount, fetchedAt, selectedTeamId, standings: [{ position, teamName, userName, teamNo, teamId, totalScore, gapToLeader, isSelected }] }`. |
| `src/cores/bestTeamScenariosCore.js` | `computeBestTeamScenarios({chatId, teamId?, teamName?})` — status-tagged (`ok` / `no_teams` / `unknown_team` / `ambiguous_team` / `missing_cache`). Returns the 4×4 matrix `{ teamId, teamName, chip, scenarios: [{ ppm, ppmLabel, results: [{ chipKey, chipLabel, projectedPoints, expectedPriceChange, recommendation: null\|'yellow'\|'green' }] }] }`. Mirrors the Telegram `/best_team_scenarios` chip-recommendation thresholds. |
| `src/bestTeamsCalculator.js` | Accepts an optional 5th `options` arg with `mustInclude*`/`mustExclude*` filters, `rankBy: null \| 'points' \| 'budget_adjusted'`, and `resultCount`. Empty/absent options preserve legacy 4-arg behaviour byte-for-byte. |
| `src/agent/identity.js` | Reads `AGENT_HARDCODED_CHAT_ID`, exposes `getAgentChatId()`. |
| `src/agent/cacheBootstrap.js` | `ensureCacheReady()` — lazy `initializeCaches(getNotifierBot())` for the agent process; resets on failure for retry-on-next-call. |
| `src/agent/systemPrompt.js` | English system prompt; extended per phase. Includes a `tool_error` handling rule (Phase 6.2). Backticks inside the template literal MUST be escaped. |
| `src/agent/tools.js` | Tool catalogue (`defineTool` array). All 14 tools' `execute` are wrapped via `wrapToolExecute` (Phase 6.2). |
| `src/agent/runtime.js` | Builds Azure model → `wrapLanguageModel({ middleware: createTokenUsageMiddleware(…) })` (Phase 6.1) → `BuiltInAgent` (with `parallelToolCalls: false`) → `CopilotRuntime` → `createCopilotRuntimeHandler`. Caches the handler per process. |
| `src/agent/notifierBot.js` | Singleton non-polling `TelegramBot` for the agent process (Phase 6.1). Real bot when `TELEGRAM_BOT_TOKEN` set, noop fallback otherwise. Polling stays disabled so it never conflicts with the main bot's poller on the same token. |
| `src/agent/tokenUsageMiddleware.js` | `LanguageModelV3Middleware` that pipes the stream through a `TransformStream` and logs every `finish` chunk's per-step token usage (Phase 6.1). Reads the V3 NESTED usage shape (`usage.inputTokens.total` / `usage.outputTokens.total`). Logging is fire-and-forget — a Telegram outage cannot break the LLM stream. |
| `src/agent/wrapToolExecute.js` | `wrapToolExecute(toolName, fn)` try/catches the execute and returns `{ status: 'tool_error', tool, errorId, userMessage }` on throw (Phase 6.2). Full error → `ERRORS_CHANNEL_ID` via `sendErrorMessage(notifierBot, …)`. The 8-char `errorId` is the user-visible correlation token. Raw `err.message` is NEVER included in the returned UI shape. |
| `src/agent/writeToolHelpers.js` | `defineWriteTool(...)` stages serializable intents and registers commit handlers; `executeConfirmedWrite` consumes only server-approved intents. |
| `src/agent/writeDecision.js` | Applies authenticated UI `approve` / `cancel` decisions to the durable pending-write row. |
| `src/services/pendingWritesStore.js` | Azure Table `PendingAgentWrites`: chat-isolated staged/approved intents, ~5-minute TTL, immediate cancel, throttled expiry sweep, ETag-protected single-use consume. |
| `web/src/components/WriteDecisionContext.tsx` | Builds `/api/agent/write-decision`, attaches the Google bearer token, and exposes the decision client to confirmation cards. |
| `web/src/components/WriteConfirmCard.tsx` | Yes/Cancel UI. Records the authenticated server decision before appending any chat message; never sends a nonce on cancellation. |
| `web/src/components/ToolErrorFallback.tsx` | Shared red-banner fallback + `isToolErrorResult()` type-guard (Phase 6.2). All 12 render hooks short-circuit on `tool_error` via this component — no JSX duplication. |
| `agentWebhook/function.json` | Azure Functions httpTrigger config (route `agent/{*restOfPath}`). |
| `agentWebhook/index.js` | Bridges Azure Functions v3 (context, req) onto a Web Request; handles OPTIONS preflight + CORS; tolerant of both `Uint8Array` and string body chunks. |
| `web/src/App.tsx` | Mounts `<CopilotKit>` + `<CopilotChat />`; reads `VITE_AGENT_API_URL`. |
| `web/src/components/NextRacesTable.tsx` | `get_next_races` rich render. |
| `web/src/components/BestTeamsTable.tsx` | `get_best_teams` rich render (top-10 table, captain badge, must-include highlights, penalty markers). |
| `web/src/components/UserTeamsList.tsx` | `list_user_teams` rich render (card grid). |
| `web/src/components/FollowedTeamsGrid.tsx` | `list_followed_teams` rich render — card per team with `leagueName: position` chips, active-team highlight. |
| `web/src/components/LeaderboardTable.tsx` | `get_leaderboard` rich render — sortable standings table with the user's row highlighted; status fallbacks for `not_followed` / `not_found`. |
| `web/src/components/BestTeamScenariosMatrix.tsx` | `get_best_team_scenarios` rich render — 4 ppm sections × 4 chip rows showing projected points, Δ price change, and 🟢/🟡 chip recommendation dots mirroring `/best_team_scenarios`. |
| `src/cores/nextRaceInfoCore.js` | `getNextRaceInfo({onFetch?, onError?})` — reads `nextRaceInfoCache[sharedKey]` + opportunistic `weatherForecastCache`; on cache miss fetches live weather via `getWeatherForecast` and populates the cache. Callbacks let the Telegram adapter wire `sendLogMessage`/`sendErrorMessage`; the agent omits them. |
| `src/cores/raceWeatherCore.js` | `getRaceWeather({now?, onFetch?, onError?})` — hourly forecasts per session (3 hours starting at each session start, filtered by `nowRounded`). `now` injection keeps tests deterministic. |
| `src/cores/deadlineCore.js` | `getDeadlineSnapshot({now?})` — `{status, raceName, sessionType, sessionLabel, sessionStartsAt, nowIso, alreadyStarted}`. Server returns absolute timestamps; the React `<DeadlineCountdown />` ticks client-side with skew compensation. Additive — `deadlineHandler.js` (with its existing pure helpers) is untouched. |
| `web/src/components/RaceInfoCard.tsx` | `get_next_race_info` rich render — header + circuit image + schedule (quali/race/+sprint pair) + weather chips + historical results table + track history. |
| `web/src/components/WeatherForecast.tsx` | `get_race_weather` rich render — per-session card with hourly chips: temp, rain %/mm, wind, humidity, cloud cover. |
| `web/src/components/DeadlineCountdown.tsx` | `get_deadline` rich render — live ticking countdown (days/hours/min/sec) anchored to server clock via `nowIso` skew; stops ticking once deadline passes; collapses to "already started" state when applicable. |
| `src/cores/currentTeamCore.js` | `getCurrentTeam({chatId, teamId?, teamName?})` — status-tagged (`ok` / `no_teams` / `unknown_team` / `ambiguous_team` / `missing_cache`). Team resolution mirrors `bestTeamsCore.pickTeamId` exactly. Returns `{teamId, teamName, chip, drivers, constructors, boostDriver, extraBoostDriver, freeTransfers, teamInfo: {totalPrice, costCapRemaining, overallBudget, teamExpectedPoints, teamPriceChange}, budgetChangePointsPerMillion, budgetAdjustedPoints, remainingRaceCount}`. |
| `src/cores/liveScoreCore.js` | `getLiveScoreForTeam({chatId, leagueCode, teamId?, teamName?})` + `getLiveScoreLeaderboard({chatId, leagueCode})` — both validate `leagueCode` against `listUserLeagues(chatId)` before fetching. Per-team mode defaults to the user's `selectedTeam` when no team args. All-teams mode sorts by total live points desc (tie-break: total live price change desc) and marks the user's row with `isSelected`. |
| `src/utils/liveScoreCalc.js` | Pure scoring helpers extracted in Phase 5 from `liveScoreHandler.js` so both the Telegram surface and the agent core can share `mapLockedTeamForScoring` / `calculateLiveScoreBreakdown` / `deriveLiveScoreOptions`. The handler re-exports these names for back-compat with its existing 735-line test. |
| `web/src/components/CurrentTeamCard.tsx` | `get_current_team` rich render — team header with chip badge, drivers/constructors chips (boost ⭐, mega-captain 🏆), metrics grid (total price, cost cap remaining, overall budget, expected points, budget-adjusted when ppm preset > 0, expected price change, free transfers). |
| `web/src/components/LiveScoreBreakdown.tsx` | `get_live_score_for_team` rich render — header with league/matchday/team/last-update; big total-live-points number with pre-penalty + Δ price change; active-chip badges; per-driver and per-constructor cards with effective points × multiplier badge (x2 / x3) + session breakdown (Sprint/Qualifying/Race with POS/PG/OV/FL/DD/TW/FP metrics, only non-zero ones shown). |
| `web/src/components/LiveScoreLeaderboard.tsx` | `get_live_score_leaderboard` rich render — sortable table (rank, team, live pts, Δ price), user row highlighted with `YOU` badge, `†` marker on rows with transfer penalty, footer note when any row has a penalty. |
| `scripts/dev-agent-server.js` | Local dev wrapper around `agentWebhook/index.js`. Not deployed. |

---

## Tips for Contributors

- **Console Noise in Tests:** Many tests intentionally log errors. Filter by test file name when diagnosing issues.
- **Time Zone Handling:** `formatDateTime` currently uses `Asia/Jerusalem`; adjust carefully if adding time-sensitive features.
- **Cache Awareness:** Before fetching external data, check relevant caches to avoid redundant requests (see `nextRaceInfoHandler` and `nextRacesHandler`).
- **Multi-Team Awareness:** Team-related caches are nested by team ID. Always use `resolveSelectedTeam(bot, chatId)` as a guard before accessing team-scoped data. Access patterns: `currentTeamCache[chatId]?.[teamId]`, `bestTeamsCache[chatId]?.[teamId]`, `selectedChipCache[chatId]?.[teamId]`.
- **Admin Safeguards:** Use `isAdminMessage` from `src/utils` to restrict sensitive commands.
- **Menu Navigation:** Maintain `MENU_CATEGORIES` order for a consistent UI. Set `hideFromMenu: true` on a category to hide the entire category from the interactive `/menu`, or on an individual command entry to hide just that one button (e.g. `/menu` inside `HELP_MENU` is hidden so it doesn't surface as a button inside the menu it produces). The flag does not affect `/help` output or the BotFather command list.
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
