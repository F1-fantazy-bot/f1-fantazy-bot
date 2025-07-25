# F1-FANTAZY-BOT

A Telegram bot designed to help users manage their F1 Fantasy teams, providing tools for team optimization, budget tracking, and staying updated with race data. The bot integrates with Azure services for data persistence and AI-powered image processing capabilities.

## Features

### F1 Fantasy Team Management

- **Multiple Input Methods**: Input team data via direct JSON or by sending screenshots (photos) of drivers, constructors, and current team setups
- **AI-Powered Image Processing**: Automatically extract data from F1 Fantasy screenshots using Azure OpenAI
- **Natural Language Commands**: Send any text and the bot will interpret it using AI to run the matching commands. Send `.` to open the menu.
### Team Optimization & Analysis

- **Best Teams Calculator**: Calculate and display the best possible fantasy teams based on cached data
- **Budget & Team Info**: Display current team information, including budget details and composition
- **Team Simulations**: Load and view fantasy team simulations for strategic planning

### Chip Management

- **Interactive Chip Selection**: Choose and apply F1 Fantasy chips (Extra DRS, Wildcard, Limitless)
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
- **Automated Data Updates**: Trigger web scraping for the latest F1 Fantasy data (admin feature)
- **Real-time Updates**: Stay current with the latest fantasy prices and availability

### Azure Cost Management

- **Real-time Billing Stats**: View current and previous month Azure spending with service breakdown
- **Cost Monitoring**: Track Azure service usage and costs for budget management
- **Service Analytics**: Detailed breakdown by Azure service (Functions, Storage, OpenAI, etc.)
- **Admin-Only Access**: Secure access to sensitive billing information

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

   # Azure Cost Management (Optional - for billing stats)
   AZURE_SUBSCRIPTION_ID=your_azure_subscription_id
   AZURE_CLIENT_ID=your_azure_service_principal_client_id
   AZURE_CLIENT_SECRET=your_azure_service_principal_client_secret
   AZURE_TENANT_ID=your_azure_tenant_id

   # External Services
   AZURE_LOGICAPP_TRIGGER_URL=your_scraping_trigger_url
   ```

   **Getting the required credentials:**

   - **Telegram Bot Token**: Go to [@BotFather](https://t.me/botfather) and follow the instructions to create a new bot. This token will be your test token for local development.

   - **Azure OpenAI**: Get your endpoint, API key, and model deployment name from the [Azure AI portal](https://ai.azure.com/).

   - **Azure Storage**: Create a storage account in Azure and get the connection string from the portal. Create a container for the bot's data storage.

   - **Azure Cost Management**: Create a service principal in Azure with Cost Management Reader permissions. Get the client ID, client secret, tenant ID, and subscription ID from the Azure portal.

4. **Run the bot**

   ```bash
   npm start
   ```

   The bot will start in polling mode for local development.

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

- **`/best_teams`** - Calculate and display the best possible teams based on your cached data
- **`/current_team_info`** - Calculate current team info and budget based on your cached data
- **`/chips`** - Choose a chip to use for the current race (Extra DRS, Wildcard, Limitless)

#### Analysis & Stats

- **`/next_race_info`** - Get comprehensive information about the next F1 race including schedule, weather forecast, historical statistics with qualifying results and race winners, safety data, and track information
- **`/get_current_simulation`** - Show the current simulation data, name, and last update timestamp

#### Utilities

- **`/print_cache`** - Show the currently cached drivers, constructors, and current team
- **`/reset_cache`** - Clear all cached data for this chat
### Admin Commands

Restricted to authorized administrators:

- **`/load_simulation`** - Load the latest simulation data
- **`/trigger_scraping`** - Trigger web scraping for latest F1 Fantasy data
- **`/billing_stats`** - View current month Azure billing statistics with service breakdown
- **`/get_botfather_commands`** - Get commands formatted for BotFather setup
- **`/version`** - Display commit ID, commit message, and link for the deployed version

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
- **`@azure/identity`**: Azure authentication for cost management services
- **`openai`**: Azure OpenAI integration for image processing and data extraction
- **`dotenv`**: Environment variable management
- **`jest`**: Testing framework

### Development Tools

- **ESLint**: Code linting and formatting
- **Husky**: Git hooks for code quality
- **Jest**: Unit testing with coverage reports

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
│   ├── bot.js                     # Main bot entry point
│   ├── messageHandler.js          # Message routing logic
│   ├── textMessageHandler.js      # Text command processing
│   ├── photoMessageHandler.js     # Image processing logic
│   ├── callbackQueryHandler.js    # Inline button handling
│   ├── cache.js                   # In-memory data cache
│   ├── azureStorageService.js     # Azure Blob Storage integration
│   ├── azureBillingService.js     # Azure Cost Management integration
│   ├── jsonDataExtraction.js      # AI-powered data extraction
│   ├── constants.js               # Application constants
│   ├── commandsHandler/           # Individual command implementations
│   └── utils/                     # Utility functions
├── telegramWebhook/               # Azure Functions webhook handler
├── docs/                          # Project documentation
├── package.json                   # Project dependencies and scripts
└── .env                          # Environment variables (create this)
```

## Available Scripts

- **`npm start`** - Start the bot in development mode
- **`npm test`** - Run unit tests
- **`npm run test:coverage`** - Run tests with coverage report
- **`npm run lint`** - Check code style and quality
- **`npm run lint:fix`** - Automatically fix linting issues
