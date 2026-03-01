# F1 Fantasy Bot – Agent Handbook

This repository contains a Telegram bot that helps manage F1 Fantasy teams. The codebase is Node.js/JavaScript, heavily tested with Jest, and organized around command handlers that power Telegram commands, natural-language prompts, and inline menus.

---

## Core Concepts

- **Entry Point:** `src/bot.js` bootstraps the Telegram bot, initializes caches via Azure Storage, and registers message/callback listeners.
- **Message Flow:**
  - `src/messageHandler.js` distinguishes between text, photo, and other message types. It also checks for pending replies (see Pending Reply Manager below) before routing to type-specific handlers.
  - `src/textMessageHandler.js` routes command strings to handler functions defined in `src/commandsHandler`.
  - Generic command execution is centralized in `src/commandsHandler/commandHandlers.js`, which maps command constants to handler implementations.
- **Pending Reply Manager:** `src/pendingReplyManager.js` provides a centralized mechanism for commands that need a follow-up reply from the user (text or photo). State is stored in **Azure Table Storage** for multi-server support. The check happens in `messageHandler.js` **before** the text/photo branching, so reply handlers receive the full message regardless of type. Supports optional `data` parameter for multi-step commands that need to store intermediate state between steps.
- **Pending Reply Registry:** `src/pendingReplyRegistry.js` maps command identifiers (e.g., `'report_bug'`, `'send_message_to_user'`) to builder functions that reconstruct handlers, validators, and prompts. This enables serializable storage — only the command ID and optional data are persisted, and the full behavior is rebuilt on any server instance. Builder functions receive `(chatId, data)` where `data` is optional stored state for multi-step commands.
- **Caching:** `src/cache.js` holds in-memory data for drivers, constructors, current team info, simulations, next race info, weather forecasts, and language preferences. `src/cacheInitializer.js` populates those caches on startup — most data comes from Azure Blob Storage, while language preferences are loaded from the `UserRegistry` Azure Table via `listAllUserLanguages()`.
- **User Registry:** `src/userRegistryService.js` tracks all users who interact with the bot in an Azure Table Storage table (`UserRegistry`). On every allowed message, `messageHandler.js` calls `upsertUser(chatId, chatName)` in a fire-and-forget manner (no `await`) so that registry failures never block message handling. The `/list_users` admin command (`src/commandsHandler/listUsersHandler.js`) displays all registered users with their details.
- **Utilities & Services:**
  - `src/utils` contains Telegram helpers, formatting (`formatDateTime`), and logging utilities.
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
3. **Exports:** `src/commandsHandler/index.js` re-exports all handler functions for convenient imports elsewhere.
4. **Command Router:** `src/commandsHandler/commandHandlers.js` maps constants to handler functions and implements `executeCommand` used by the ASK agent and menu callbacks.
5. **Text Routing:** `src/textMessageHandler.js` checks incoming text and dispatches to the appropriate handler; non-command text is parsed as JSON or delegated to the ASK agent.
6. **Natural Language Prompt:** `src/prompts.js` exports `buildAskSystemPrompt(isAdmin)`, which dynamically builds the command allowlist for the ASK agent. The allowed commands are derived from `MENU_CATEGORIES` in `src/constants.js` (single source of truth) — user commands come from non-admin categories, admin commands from `adminOnly` categories. A small `EXTRA_ASK_COMMANDS` array covers chip sub-commands (`/extra_drs`, `/limitless`, `/wildcard`, `/reset_chip`) that aren't in any menu category but should be discoverable via free text. The `askHandler.js` checks `isAdminMessage(msg)` before building the prompt, so admin commands are only included for admin users. When adding a new command, simply adding it to `MENU_CATEGORIES` in `constants.js` is sufficient — it will automatically appear in the ASK prompt.
7. **Menu/Help:** `src/commandsHandler/menuHandler.js` and `helpHandler.js` build structured menus using the definitions in `constants.js`.

---

## Tests

- Jest-based tests live alongside source files (e.g., `src/commandsHandler/nextRacesHandler.test.js`).
- Run `npm test` to execute the full suite.
- Many tests use console error logging to validate error-path behavior; expect noisy output during normal test runs.

---

## Key Commands (User-Facing)

- `/best_teams`, `/current_team_info`, `/chips`, `/extra_drs`, `/limitless`, `/wildcard`, `/reset_chip`
- `/print_cache`, `/reset_cache`
- `/next_race_info`, `/next_races`, `/next_race_weather`
- `/get_current_simulation`
- `/menu`, `/help`, `/lang`
- `/report_bug` _(reply-based — uses pending reply manager)_

**Admin-only:** `/load_simulation`, `/trigger_scraping`, `/get_botfather_commands`, `/billing_stats`, `/version`, `/list_users`, `/send_message_to_user`

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
- **Multi-step:** See `src/commandsHandler/sendMessageToUserHandler.js` — the `/send_message_to_user` admin command uses a two-step reply flow with intermediate data storage. Step 1 collects the target user's chat ID (validated against the User Registry), then re-registers with `{ step: 'collect_message', targetChatId }`. Step 2 collects the message text and sends it to the target user. The handler uses lazy `require` for `pendingReplyManager` to avoid circular dependencies.

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
2. `upsertUser` uses Azure Table Storage **Merge mode** — it only sends `chatName` and `lastSeen` (plus `firstSeen` for new users). All other existing attributes (lang, future fields) are automatically preserved by Merge mode without needing to read them first.
3. Errors are caught and logged silently (`console.error`) — the user registry never blocks or breaks message handling.
4. The `/list_users` admin command (`src/commandsHandler/listUsersHandler.js`) calls `listAllUsers()` to fetch all registered users. `listAllUsers()` automatically returns all non-system fields from each entity, so new attributes are included without code changes.
5. User attributes (e.g., language preferences) are stored via `updateUserAttributes(chatId, { lang })` — called by `setLanguageHandler.js` and `callbackQueryHandler.js`. This generic function uses Merge mode so it only writes the specified attributes without reading or overwriting others. On startup, `cacheInitializer.js` calls `listAllUserLanguages()` to populate the in-memory `languageCache`.

### Generic Merge Pattern

The service uses Azure Table Storage's **Merge mode** (`upsertEntity(entity, 'Merge')`) as its core pattern. This means:

- **`upsertUser`** only sends fields it owns (`chatName`, `lastSeen`, `firstSeen`) — all other attributes are untouched.
- **`updateUserAttributes`** only sends the provided key-value pairs — no read step needed, no risk of overwriting unrelated fields.
- **Adding a new attribute** requires only calling `updateUserAttributes(chatId, { newField: value })` — no changes to `upsertUser` or any existing code.
- **Race conditions are eliminated** — Merge mode is atomic for the fields being updated, unlike the old read-then-write pattern.

### Table Schema

The table is **extensible** — new attributes can be added at any time without schema changes. Known fields:

| Field          | Type     | Description                                                               |
| -------------- | -------- | ------------------------------------------------------------------------- |
| `partitionKey` | `string` | Always `'User'`                                                           |
| `rowKey`       | `string` | The `chatId` (stringified)                                                |
| `chatName`     | `string` | Display name from `getChatName(msg)`                                      |
| `lang`         | `string` | Language code (`'en'`, `'he'`). Optional — absent means default (`'en'`). |
| `firstSeen`    | `string` | ISO timestamp — set on first interaction, preserved on updates            |
| `lastSeen`     | `string` | ISO timestamp — updated on every message                                  |

### API Reference

| Method                 | Signature                                            | Purpose                                                                                                                            |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `upsertUser`           | `upsertUser(chatId, chatName) → Promise`             | Track a user interaction. Fire-and-forget — errors are logged, never thrown. Uses Merge mode to preserve all other fields.         |
| `updateUserAttributes` | `updateUserAttributes(chatId, attributes) → Promise` | Update one or more user attributes using Merge mode. No read step needed. Example: `updateUserAttributes(chatId, { lang: 'he' })`. |
| `listAllUsers`         | `listAllUsers() → Promise<Array<Object>>`            | Return all registered users with all stored attributes. Automatically includes future fields.                                      |
| `listAllUserLanguages` | `listAllUserLanguages() → Promise<Object>`           | Return `{ chatId: lang }` mapping for all users with a language set. Used by `cacheInitializer`.                                   |

---

## Tips for Contributors

- **Console Noise in Tests:** Many tests intentionally log errors. Filter by test file name when diagnosing issues.
- **Time Zone Handling:** `formatDateTime` currently uses `Asia/Jerusalem`; adjust carefully if adding time-sensitive features.
- **Cache Awareness:** Before fetching external data, check relevant caches to avoid redundant requests (see `nextRaceInfoHandler` and `nextRacesHandler`).
- **Admin Safeguards:** Use `isAdminMessage` from `src/utils` to restrict sensitive commands.
- **Menu Navigation:** Maintain `MENU_CATEGORIES` order for a consistent UI. Hiding a command from the interactive menu requires setting `hideFromMenu: true` in its category entry.
- **Localization:** Always wrap user-facing strings with `t('key', chatId)` to ensure translation support.
- **Keep `AGENTS.md` Up to Date:** After completing any task that changes the codebase structure, adds new commands, modifies architecture, or introduces new patterns, review `AGENTS.md` and update it to reflect the changes. This file is the primary reference for contributors and AI agents — keeping it accurate prevents confusion and misaligned implementations.

With this reference and the checklist above, adding features—especially new commands—should be predictable and safe.
