# System Patterns

- **Command Modules**: Each Telegram command has a dedicated handler in `src/commandsHandler/` exporting a function that receives bot, chat, and arguments.
- **Cache Layer**: `src/cache.js` maintains in-memory caches for drivers, constructors and team data. Initial state is loaded from Azure Blob Storage.
- **Utility Functions**: Common helpers under `src/utils/` handle message formatting, admin validation and data processing.
- **Testing**: Jest tests reside alongside source files to validate core logic.
- **Environment Configuration**: `local.settings.json` and `.env` define runtime settings for local and Azure deployment.
