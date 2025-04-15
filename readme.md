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
   ```
   to create a bot token, go to [@BotFather](https://t.me/botfather) and follow the instructions.
   this bot token will be your test token, you can use it to test the bot locally.
4. Run the bot:
   ```
   npm start
   ```