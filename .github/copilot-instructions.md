# Copilot Instructions — f1-fantazy-bot

> **Primary reference:** `AGENTS.md` at the repo root is the authoritative handbook for this codebase (architecture, conventions, command catalogue, multi-team system, pending reply manager, user registry, nickname system). Read it before making non-trivial changes — do not duplicate its content, update it when you change the patterns it describes.

## Commands

- **Install:** `npm install`
- **Run (dev, polling):** `npm start`
- **Lint:** `npm run lint` / `npm run lint:fix`
- **Test (full suite):** `npm test`
- **Test with coverage:** `npm run test:coverage`
- **Run a single test file:** `npx jest path/to/file.test.js`
- **Run a single test by name:** `npx jest -t "test name pattern"`

Tests intentionally log errors to stderr to exercise error paths — noisy output during a green run is normal.

## Architecture essentials

- **Runtime:** Node.js Telegram bot (`node-telegram-bot-api`). Two entry points share the same bot instance:
  - `src/bot.js` — long-polling for local dev. Exports `bot` **and** a `cacheReady` promise.
  - `telegramWebhook/index.js` — Azure Function webhook for production. **Must `await bot.cacheReady`** before calling `bot.processUpdate` (prevents cold-start race where caches are empty).
- **Message flow:** `messageHandler.js` → checks pending replies first (regardless of text/photo) → routes to `textMessageHandler.js` or photo handler → dispatches via `commandsHandler/commandHandlers.js` (central `executeCommand` map). Non-command text falls through to the AI ASK agent (`askHandler.js` + `prompts.js`).
- **Caches** (`src/cache.js`) are in-memory and populated on startup by `cacheInitializer.js` from Azure Blob Storage + the `UserRegistry` Azure Table. Team-scoped caches (`currentTeamCache`, `bestTeamsCache`, `selectedChipCache`) are **nested by team ID**: `cache[chatId][teamId]`. Per-user non-team caches (`driversCache`, `constructorsCache`, `userCache`) are keyed by `chatId` only.
- **Persistence:** Azure Blob Storage for team JSON blobs (`user-teams/{chatId}_{teamId}.json`) and pending team assignments; Azure Table Storage (`UserRegistry` table) for user metadata + pending replies. Both use the single `AZURE_STORAGE_CONNECTION_STRING`.

## Key conventions

- **Adding a command:** constant in `src/constants.js` → handler in `src/commandsHandler/` → export in `commandsHandler/index.js` → mapping in `commandHandlers.js` → route in `textMessageHandler.js` → Jest test alongside handler. Adding the command to `MENU_CATEGORIES` automatically exposes it to the ASK NL agent (admin commands only exposed to admins). See AGENTS.md "Adding a New Command".
- **Reply-based commands** use the Pending Reply Manager (`src/pendingReplyManager.js`) + Registry (`src/pendingReplyRegistry.js`). Only a command-ID string (+ optional JSON `data`) is persisted — builders reconstruct handler/validate/prompt on any server instance. See AGENTS.md "Adding a Reply-Based Command".
- **Team-scoped commands must guard with `resolveSelectedTeam(bot, chatId)`** (returns `null` → early return). This handles the 0-team / 1-team-auto / multi-team prompt cases uniformly.
- **Localization:** wrap every user-facing string with `t('key', chatId)` from `src/i18n.js` and add both `en` and `he` entries in `src/translations.js`.
- **Logging:** use `sendLogMessage(bot, message)` for info → `LOG_CHANNEL_ID`; use `sendErrorMessage(bot, message)` for any error/failure → both `LOG_CHANNEL_ID` and `ERRORS_CHANNEL_ID`. Use `getDisplayName(chatId)` (nickname → chatName → chatId) when mentioning users in logs.
- **User registry writes are fire-and-forget** — never `await upsertUser(...)` in the hot path; failures must not block message handling. Use `updateUserAttributes(chatId, { ... })` (Azure Table Merge mode) to add/change user attributes without reading first — new fields can be added without schema changes.
- **Admin safeguards:** gate sensitive commands with `isAdminMessage(msg)` from `src/utils`.
- **Menu visibility:** hide from interactive menu (but still registerable) via `hideFromMenu: true` in the `MENU_CATEGORIES` entry.
- **Time zone:** `formatDateTime` uses `Asia/Jerusalem` — be deliberate if touching time-sensitive code.
- **Keep AGENTS.md current:** if your change alters architecture, caches, commands, or the patterns documented there, update AGENTS.md in the same PR.

## Azure

- `@azure` rule: when generating code, running terminal commands, or performing operations related to Azure, invoke the `azure_development-get_best_practices` tool if available.
