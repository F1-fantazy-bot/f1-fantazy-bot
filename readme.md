# F1-FANTAZY-BOT

A Telegram bot designed to help users manage their F1 Fantasy teams, providing tools for team optimization, budget tracking, and staying updated with race data. The bot integrates with Azure services for data persistence and AI-powered image processing capabilities.

## Features

### F1 Fantasy Team Management

- **Multiple Input Methods**: Input team data via direct JSON or by sending screenshots (photos) of drivers, constructors, and current team setups
- **AI-Powered Image Processing**: Automatically extract data from F1 Fantasy screenshots using Azure OpenAI

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

### Bot Administration

- **BotFather Integration**: Generate command lists for easy bot setup
- **Logging & Monitoring**: Comprehensive logging to dedicated channels
- **Admin Controls**: Restricted commands for data management and system control

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

   # External Services
   AZURE_LOGICAPP_TRIGGER_URL=your_scraping_trigger_url
   ```

   **Getting the required credentials:**

   - **Telegram Bot Token**: Go to [@BotFather](https://t.me/botfather) and follow the instructions to create a new bot. This token will be your test token for local development.

   - **Azure OpenAI**: Get your endpoint, API key, and model deployment name from the [Azure AI portal](https://ai.azure.com/).

   - **Azure Storage**: Create a storage account in Azure and get the connection string from the portal. Create a container for the bot's data storage.

4. **Run the bot**

   ```bash
   npm start
   ```

   The bot will start in polling mode for local development.

## Available Commands and Inputs

### User Commands

All users can access these commands:

- **`/help`** - Show help message with all available commands
- **`/best_teams`** - Calculate and display the best possible teams based on your cached data
- **`/current_team_info`** - Calculate current team info and budget based on your cached data
- **`/chips`** - Choose a chip to use for the current race (Extra DRS, Wildcard, Limitless)
- **`/print_cache`** - Show the currently cached drivers, constructors, and current team
- **`/reset_cache`** - Clear all cached data for this chat
- **`/get_current_simulation`** - Show the current simulation data and name
- **`/next_race_info`** - Get comprehensive information about the next F1 race including schedule, weather forecast, historical statistics with qualifying results and race winners, safety data, and track information

### Admin Commands

Restricted to authorized administrators:

- **`/trigger_scraping`** - Trigger web scraping for latest F1 Fantasy data
- **`/load_simulation`** - Load the latest simulation data
- **`/get_botfather_commands`** - Get commands formatted for BotFather setup

### Other Input Methods

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
│   ├── jsonDataExtraction.js      # AI-powered data extraction
│   ├── constants.js               # Application constants
│   ├── commandsHandler/           # Individual command implementations
│   └── utils/                     # Utility functions
├── telegramWebhook/               # Azure Functions webhook handler
├── package.json                   # Project dependencies and scripts
└── .env                          # Environment variables (create this)
```

## Available Scripts

- **`npm start`** - Start the bot in development mode
- **`npm test`** - Run unit tests
- **`npm run test:coverage`** - Run tests with coverage report
- **`npm run lint`** - Check code style and quality
- **`npm run lint:fix`** - Automatically fix linting issues
