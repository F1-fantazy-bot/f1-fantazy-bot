# F1 Fantasy Bot – Agent Handbook

This repository contains a Telegram bot that helps manage F1 Fantasy teams. The codebase is Node.js/JavaScript, heavily tested with Jest, and organized around command handlers that power Telegram commands, natural-language prompts, and inline menus.

---

## Core Concepts

- **Entry Point:** `src/bot.js` bootstraps the Telegram bot, initializes caches via Azure Storage, and registers message/callback listeners.
- **Message Flow:**
  - `src/messageHandler.js` distinguishes between text, photo, and other message types.
  - `src/textMessageHandler.js` routes command strings to handler functions defined in `src/commandsHandler`.
  - Generic command execution is centralized in `src/commandsHandler/commandHandlers.js`, which maps command constants to handler implementations.
- **Caching:** `src/cache.js` holds in-memory data for drivers, constructors, current team info, simulations, next race info, weather forecasts, and language preferences. `src/cacheInitializer.js` populates those caches from Azure Blob Storage on startup.
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
6. **Natural Language Prompt:** `src/prompts.js` defines `ASK_SYSTEM_PROMPT`, the command allowlist consumed by the ASK agent. Any new command that should be discoverable via free text must be added to this prompt.
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

**Admin-only:** `/load_simulation`, `/trigger_scraping`, `/get_botfather_commands`, `/billing_stats`, `/version`

---

## Environment & Deployment

Required environment variables (see `readme.md` for full list):
- Telegram: `TELEGRAM_BOT_TOKEN`
- Azure OpenAI: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPEN_AI_MODEL`
- Azure Storage: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`
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

4. **Natural Language Support (Optional)**
   - If the command should be available through free-text ASK interactions, add it to the `Allowed commands` list in `src/prompts.js` (ASK system prompt).

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

Following this sequence keeps the bot’s command catalogue consistent across direct commands, menus, and natural-language interactions.

---

## Tips for Contributors

- **Console Noise in Tests:** Many tests intentionally log errors. Filter by test file name when diagnosing issues.
- **Time Zone Handling:** `formatDateTime` currently uses `Asia/Jerusalem`; adjust carefully if adding time-sensitive features.
- **Cache Awareness:** Before fetching external data, check relevant caches to avoid redundant requests (see `nextRaceInfoHandler` and `nextRacesHandler`).
- **Admin Safeguards:** Use `isAdminMessage` from `src/utils` to restrict sensitive commands.
- **Menu Navigation:** Maintain `MENU_CATEGORIES` order for a consistent UI. Hiding a command from the interactive menu requires setting `hideFromMenu: true` in its category entry.
- **Localization:** Always wrap user-facing strings with `t('key', chatId)` to ensure translation support.

With this reference and the checklist above, adding features—especially new commands—should be predictable and safe.
