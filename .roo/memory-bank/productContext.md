# Project Overview

F1-FANTAZY-BOT is a Telegram bot that helps manage F1 Fantasy teams. Users can upload screenshots or JSON to update their team and receive suggestions for optimal lineups. The bot integrates with Azure services for data persistence and uses OpenAI Vision for extracting structured data from images.

## Domain Knowledge
- Fantasy team optimization for Formula 1
- Telegram bot commands and interactive menus
- Azure Blob Storage and Cost Management APIs

## Design Constraints
- Node.js environment with Telegram Bot API
- Supports local polling mode and Azure Functions webhook mode
- Data stored in Azure Storage; sensitive settings provided via environment variables

