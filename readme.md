# F1-FANTAZY-BOT

## how to run locally

1. Clone the repository
2. npm install
3. Create a `.env` file in the root directory and add your telegram bot token and Azure OpenAI details:

   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint
   AZURE_OPENAI_API_KEY=your_azure_openai_api_key
   AZURE_OPEN_AI_MODEL=your_azure_openai_model
   AZURE_LOGICAPP_TRIGGER_URL=your_scraping_trigger_url
   ```

   to create a bot token, go to [@BotFather](https://t.me/botfather) and follow the instructions.
   this bot token will be your test token, you can use it to test the bot locally.

   you can get details for Azure OpenAI from the [Azure AI portal](https://ai.azure.com/).

4. Run the bot:
   ```
   npm start
   ```

## Available Commands

The bot supports the following commands:

- `/best_teams` - Calculate and display the best possible teams based on your cached data
- `/current_team_budget` - Calculate the current team budget based on your cached data
- `/chips` - Choose a chip to use for the current race
- `/print_cache` - Show the currently cached drivers, constructors, and current team
- `/reset_cache` - Clear all cached data for this chat
- `/triggerScraping` - Trigger web scraping for latest F1 Fantasy data
- `/help` - Show help message with all available commands
