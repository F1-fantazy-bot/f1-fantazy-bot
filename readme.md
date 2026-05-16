# F1-FANTAZY-BOT

A Telegram bot designed to help users manage their F1 Fantasy teams, providing tools for team optimization, budget tracking, and staying updated with race data. The bot integrates with Azure services for data persistence and AI-powered image processing capabilities.

A **web-chat agent** (preview) provides a second channel for the same functionality — a Vite + React + CopilotKit chat UI talking to a CopilotKit v2 `BuiltInAgent` running on Azure OpenAI. The Telegram bot is unaffected; both surfaces call the same business logic via pure cores in `src/cores/`. See [`AGENTS.md` → Agent (Web Chat)](AGENTS.md#agent-web-chat) for the full architecture.

## Features

### F1 Fantasy Team Management

- **Multiple Input Methods**: Input team data via direct JSON or by sending screenshots (photos) of drivers, constructors, and current team setups
- **AI-Powered Image Processing**: Automatically extract data from F1 Fantasy screenshots using Azure OpenAI
- **Natural Language Commands**: Send any text and the bot will interpret it using AI to run the matching commands. Send `.` to open the menu.
### Team Optimization & Analysis

- **Best Teams Calculator**: Calculate and display the best possible fantasy teams based on cached team data, projections, and the latest prices
- **Best-Team Ranking Preference**: Tune how much expected budget changes should affect best-team ranking via `/set_best_team_ranking`
  - Non-default ranking modes also show `Budget-Adjusted Points` in `/best_teams` output so users can see the impact of the selected ranking mode
- **Budget & Team Info**: Display current team information, including budget details and composition
- **Team Simulations**: Load and view fantasy team projections for strategic planning; latest prices are applied when available

### Chip Management

- **Interactive Chip Selection**: Choose and apply F1 Fantasy chips (Extra Boost, Wildcard, Limitless)
- **Chip Strategy Support**: Get guidance on optimal chip usage timing

### Data Management

- **Persistent Cache**: View currently cached drivers, constructors, and team data
- **Cache Control**: Reset cache data per chat for fresh starts
- **Azure Integration**: Utilizes Azure Blob Storage for data persistence across sessions

### Race Information & Updates

- **Next Race Info**: Get detailed information about upcoming F1 races, including:
  - Race schedule and session times with weather forecasts
  - Historical race statistics for the last decade
  - Qualifying results (pole position, 2nd place, 3rd place) and race winners for each season
  - Track safety statistics (safety cars, red flags, overtakes)
  - Track history and background information
  - Circuit image of the track
- **Next Race Weather**: Detailed hourly weather forecast for qualifying, race and sprint sessions
- **Automated Data Updates**: Trigger web scraping for the latest F1 Fantasy data (admin feature)
- **Price Updates**: Use the latest global F1 Fantasy prices, with simulation/imported prices as fallback

### League Leaderboards

- **League Follow**: Admins can follow leagues via `/follow_league` (league code captured and validated against the blob produced by the sibling `f1-fantasy-api-data` repo)
- **Leaderboard Viewer**: `/leaderboard` shows a compact standings table (position, team name, total score) for any followed league; supports multiple leagues per user with inline selection
- **League Unfollow**: `/unfollow_league` removes a league follow via an inline keyboard

### Azure Cost Management

- **Real-time Billing Stats**: View current and previous month Azure spending with service breakdown
- **Cost Monitoring**: Track Azure service usage and costs for budget management
- **Service Analytics**: Detailed breakdown by Azure service (Functions, Storage, OpenAI, etc.)
- **Admin-Only Access**: Secure access to sensitive billing information

### Web-Chat Agent (Preview)

- **Second channel** for the bot: a Vite + React + CopilotKit chat UI talking to a CopilotKit v2 `BuiltInAgent` running on Azure OpenAI
- **Same business logic** as the Telegram bot — both surfaces call pure cores in `src/cores/`
- **Generative UI**: tool results render as tailored React components (e.g. `<NextRacesTable />`) rather than plain text
- Currently ships three tools (`get_next_races`, `list_user_teams`, `get_best_teams` with must-include / must-exclude filters); more capabilities land phase by phase

### Bot Administration

- **BotFather Integration**: Generate command lists for easy bot setup
- **Logging & Monitoring**: Comprehensive logging to dedicated channels
- **Admin Controls**: Restricted commands for data management and system control
- **Version Reporting**: `/version` command reveals the deployed commit details

## How to Run Locally

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd f1-fantazy-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create environment configuration**

   Create a `.env` file in the root directory and add the following environment variables:

   ```env
   # Telegram Bot Configuration
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

   # Azure OpenAI Configuration
   AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint
   AZURE_OPENAI_API_KEY=your_azure_openai_api_key
   AZURE_OPEN_AI_MODEL=your_azure_openai_model_deployment_name

   # Azure Storage Configuration
   AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string
   AZURE_STORAGE_CONTAINER_NAME=your_azure_storage_container_name

   # Azure Management API
   AZURE_SUBSCRIPTION_ID=your_azure_subscription_id
   AZURE_CLIENT_ID=your_azure_service_principal_client_id
   AZURE_CLIENT_SECRET=your_azure_service_principal_client_secret
   AZURE_TENANT_ID=your_azure_tenant_id
   AZURE_RESOURCE_GROUP=your_azure_resource_group

   # Web-Chat Agent (only needed if you run `npm run dev` / `npm run dev:agent`)
   # The Telegram chatId the agent acts as in v1 single-user mode.
   # Defaults to KILZI_CHAT_ID if omitted in scripts/dev-agent-server.js.
   AGENT_HARDCODED_CHAT_ID=your_telegram_chat_id
   ```

   **Getting the required credentials:**

   - **Telegram Bot Token**: Go to [@BotFather](https://t.me/botfather) and follow the instructions to create a new bot. This token will be your test token for local development.

   - **Azure OpenAI**: Get your endpoint, API key, and model deployment name from the [Azure AI portal](https://ai.azure.com/).

   - **Azure Storage**: Create a storage account in Azure and get the connection string from the portal. Create a container for the bot's data storage.

   - **Azure Management API**: Create a service principal in Azure for local development with permissions to read billing data and run Logic App triggers. Get the client ID, client secret, tenant ID, and subscription ID from the Azure portal. `AZURE_RESOURCE_GROUP` is optional and defaults to `f1-fantazy-bot`.

4. **Run the bot**

   ```bash
   npm start
   ```

   The bot will start in polling mode for local development.

5. **(Optional) Run the web-chat agent**

   ```bash
   cd web && npm install && cd ..
   npm run dev
   ```

   This boots two processes under one terminal via `concurrently`:
   - Agent backend on `http://localhost:7071/api/agent/copilotkit` (a thin Node HTTP wrapper around the same handler that `agentWebhook/` exposes to Azure Functions — no Azure Functions Core Tools required)
   - Vite frontend on `http://localhost:5173/` (or `:5174` if `:5173` is busy)

   Open the Vite URL and ask the agent a question (e.g. _"What are the next races in USA?"_ or _"Best teams for kilzid3 with Verstappen but no Alonso"_). See [`AGENTS.md` → Agent (Web Chat)](AGENTS.md#agent-web-chat) for the full architecture and the pattern for adding new tools.

## Available Commands and Inputs

### Command Organization

Commands are organized into logical categories for better usability:

- **❓ Help & Menu**: Essential navigation and help commands
- **🏎️ Team Management**: Fantasy team optimization and chip management
- **📊 Analysis & Stats**: Race information and simulation data
- **🔧 Utilities**: Data management and cache operations
- **👤 Admin Commands**: Administrative tools (admin-only access)

### Interactive Menu System

- **`/menu`** - Launch the interactive menu with organized command categories for easy navigation
  - **🏎️ Team Management**: Best teams, current team info, chips selection
  - **📊 Analysis & Stats**: Next race info, current simulation data
  - **🔧 Utilities**: Cache management and data operations
  - **👤 Admin Commands**: Administrative tools (admin only)
  - **❓ Help**: Direct access to help information

### Help Command

The **`/help`** command displays all available commands organized by the same categories as the interactive menu, providing a comprehensive text-based reference that mirrors the menu structure for consistency.

### User Commands

All users can access these commands:

#### Help & Menu

- **`/help`** - Show help message with commands organized by categories
- **`/menu`** - Show interactive menu with organized command categories

#### Team Management

- **`/best_teams`** - Calculate and display the best possible teams based on your cached data, projections, and the latest prices
- **`/set_best_team_ranking`** - Set how expected budget changes affect best-team ranking suggestions
- **`/current_team_info`** - Calculate current team info and budget using cached roster data and the latest prices
- **`/chips`** - Choose a chip to use for the current race (Extra Boost, Wildcard, Limitless)

#### Analysis & Stats

- **`/next_race_info`** - Get comprehensive information about the next F1 race including schedule, weather forecast, historical statistics with qualifying results and race winners, safety data, and track information
- **`/next_race_weather`** - Show hourly weather forecast for qualifying, race and sprint sessions
- **`/get_current_simulation`** - Show the current simulation data, name, and last update timestamp

#### Utilities

- **`/print_cache`** - Show the currently cached drivers, constructors, and current team
- **`/reset_cache`** - Clear all cached data for this chat
- **`/load_simulation`** - Load the latest simulation/projection data and apply the latest prices
### Admin Commands

Restricted to authorized administrators:

- **`/trigger_scraping`** - Trigger web scraping for latest F1 Fantasy data
- **`/trigger_api_data`** - Trigger API data refresh
- **`/trigger_api_data_locked`** - Trigger locked API data refresh
- **`/trigger_next_race_info`** - Run the next race info scheduler
- **`/trigger_live_score_scheduler`** - Run the live score scheduler logic
- **`/billing_stats`** - View current month Azure billing statistics with service breakdown
- **`/get_botfather_commands`** - Get commands formatted for BotFather setup
- **`/version`** - Display commit ID, commit message, and link for the deployed version
- **`/whats_new`** - Show the latest release announcement (saved by the `release-announcement` skill into `data/announcements.json`)

### Other Input Methods

#### Free Text

Simply type any message in your language and the bot will use AI to interpret it.
If the text doesn’t match a command, the bot will attempt to run the
appropriate commands automatically. Send `.` on its own to open the menu.

#### Photo Uploads

Send screenshots of your F1 Fantasy screens and the bot will:

1. Prompt you to categorize the photo type:
   - **Drivers**: Screenshots of the drivers selection screen
   - **Constructors**: Screenshots of the constructors selection screen
   - **Current Team**: Screenshots of your current team setup
2. Process the image using AI to extract relevant data
3. Update your cached data automatically

#### JSON Input

Paste JSON data directly for:

- Team configurations
- Simulation data
- Bulk data updates

#### Numeric Input

Enter numbers when prompted by various commands for:

- Option selection
- Value inputs
- Menu navigation

## Technical Stack

### Core Technologies

- **Node.js**: Runtime environment
- **Telegram Bot API**: Bot framework using `node-telegram-bot-api`
- **Azure Integration**: Cloud services for storage and AI processing

### Key Dependencies

- **`@azure/storage-blob`**: Azure Blob Storage integration for data persistence
- **`@azure/arm-costmanagement`**: Azure Cost Management integration for billing analytics
- **`@azure/identity`**: Azure authentication for Cost Management and Logic App trigger operations
- **`openai`**: Azure OpenAI integration for image processing and data extraction (Telegram bot path)
- **`@copilotkit/runtime`** + **`@ai-sdk/azure`**: Web-chat agent runtime — `BuiltInAgent` over Azure OpenAI chat completions
- **`dotenv`**: Environment variable management
- **`jest`**: Testing framework

### Frontend Dependencies (`web/`)

The web frontend keeps its own `package.json` so its deps don't pollute the backend bundle.

- **`@copilotkit/react-core`** + **`@copilotkit/react-ui`**: `<CopilotChat />` + `useCopilotAction({ render })` for per-tool generative UI
- **`react`** + **`react-dom`**: UI library
- **`vite`** + **`@vitejs/plugin-react`**: dev server + build
- **`typescript`**: TS toolchain

### Development Tools

- **ESLint**: Code linting and formatting
- **Husky**: Git hooks for code quality
- **Jest**: Unit testing with coverage reports
- **concurrently** (dev): runs the agent + frontend dev servers in parallel under `npm run dev`

### Deployment Options

#### Local Development

- Uses polling mode to receive updates from Telegram
- Run with `npm start` for local testing

#### Production Deployment

- Includes `telegramWebhook/` directory for Azure Functions deployment
- Uses webhook mode for efficient production operation
- Integrates with Azure ecosystem for scalability

#### Test Deployment

- Mirrors production configuration using webhook mode
For detailed steps on setting up Azure Functions and integrating GitHub Actions, see [docs/azure-function-deployment.md](docs/azure-function-deployment.md).

## Project Structure

```
f1-fantazy-bot/
├── src/
│   ├── bot.js                     # Main Telegram bot entry point
│   ├── messageHandler.js          # Message routing logic
│   ├── textMessageHandler.js      # Text command processing
│   ├── photoMessageHandler.js     # Image processing logic
│   ├── callbackQueryHandler.js    # Inline button handling
│   ├── cache.js                   # In-memory data cache
│   ├── azureStorageService.js     # Azure Blob Storage integration
│   ├── azureBillingService.js     # Azure Cost Management integration
│   ├── jsonDataExtraction.js      # AI-powered data extraction
│   ├── constants.js               # Application constants
│   ├── commandsHandler/           # Individual command implementations (Telegram)
│   ├── cores/                     # Pure logic cores (shared by Telegram and the agent)
│   ├── agent/                     # Web-chat agent: identity, prompt, tools, runtime
│   └── utils/                     # Utility functions
├── telegramWebhook/               # Azure Functions handler for the Telegram bot
├── agentWebhook/                  # Azure Functions handler for the web-chat agent
├── web/                           # Vite + React + CopilotKit frontend
├── scripts/                       # Dev-only helpers (e.g. local agent server)
├── docs/                          # Project documentation
├── package.json                   # Project dependencies and scripts
└── .env                          # Environment variables (create this)
```

## Available Scripts

- **`npm start`** - Start the Telegram bot in polling mode (local development)
- **`npm test`** - Run unit tests
- **`npm run test:coverage`** - Run tests with coverage report
- **`npm run lint`** - Check code style and quality
- **`npm run lint:fix`** - Automatically fix linting issues
- **`npm run dev:agent`** - Start the web-chat agent backend on `:7071`
- **`npm run dev:web`** - Start the Vite frontend (defaults to `:5173`)
- **`npm run dev`** - Start both the agent backend and Vite frontend at once (via `concurrently`)
