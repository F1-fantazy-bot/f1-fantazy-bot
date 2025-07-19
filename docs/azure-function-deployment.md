# Azure Function Deployment Guide

This guide explains how to create a new Azure Function deployment for the F1 Fantazy Bot. It covers steps in the Azure portal and GitHub Actions integration.

## 1. Prerequisites

- An Azure account with permissions to create resources.
- Access to the GitHub repository.
- The Azure CLI installed locally (optional but recommended).

## 2. Create an Azure Function App

1. Sign in to the [Azure portal](https://portal.azure.com/).
2. Click **Create a resource** and search for **Function App**.
3. Select **Create** and fill in the required fields:
   - **Subscription** and **Resource Group**: Choose or create a resource group.
   - **Function App name**: A globally unique name (e.g., `f1-bot-func-prod`).
   - **Runtime stack**: Choose **Node.js** and select the version used by the project.
   - **Region**: Select a region close to your users.
4. In **Hosting**, create a new storage account or select an existing one.
5. Review and create the Function App.

## 3. Configure Application Settings

1. Navigate to your newly created Function App in the Azure portal.
2. Go to **Settings > Environment variables**.
3. Add the environment variables from `.env` (except secrets you manage differently).
4. Save and restart the Function App to apply changes.

## 4. Create a Test Deployment Slot

1. In the Azure portal, open your Function App.
2. Under **Deployment** select **Deployment slots** and click **Add Slot**.
3. Name the slot `test` (or another name) and clone settings from the production slot.
4. Update the slot's environment variables so it uses a separate `TELEGRAM_BOT_TOKEN` and set `NODE_ENV` to a non-production value.
5. Grant your GitHub Actions workflow access to this slot by adding a **Federated credential** to the identity attached to the Function App:
   - Open the Function App, select **Identity**, and click the link to the **Managed identity** to open its blade.
   - In the managed identity blade, go to **Settings > Federated credentials** and click **Add credential**.
   - Choose **GitHub Actions** as the source, enter your repository details, and set the subject to `pull_request`.
   - Click **Add** to save. This enables pull request deployments using OIDC.
6. Use this slot for validating changes before swapping to production.

## 5. Set Up Deployment from GitHub

1. In the Azure portal, open your Function App and go to **Deployment Center**.
2. Choose **GitHub** as the source and authorize Azure to access your GitHub account if prompted.
3. Select the repository and branch you want to deploy from (e.g., `main`).
4. Azure will automatically generate a GitHub Actions workflow file (`.github/workflows/main_f1-fantazy-bot-func.yml`) in your repository.
5. Commit the workflow file to start the first deployment.
6. Add a second workflow that deploys pull requests to the test slot (see `.github/workflows/pr_test_f1-fantazy-bot-func.yml`).

## 6. GitHub Workflow Overview

The generated workflow typically performs the following steps:

1. **Checkout the repository**.
2. **Set up Node.js** using the specified version.
3. **Install dependencies** with `npm ci`.
4. **Run tests** (optional but recommended).
5. **Deploy to Azure** using the publish profile created by the Deployment Center.

You can customize this workflow to include linting, additional tests, or build steps.

## 7. Manual Deployment with Azure CLI (Optional)

If you prefer manual deployments or need to test locally, you can use the Azure CLI:

```bash
# Sign in to Azure
az login

# Deploy the Function App from the current directory
func azure functionapp publish <FUNCTION_APP_NAME>
```

## 8. Verify the Deployment

1. After GitHub Actions completes, check the **Actions** tab in GitHub for a green check mark.
2. In the Azure portal, go to your Function App and open **Functions** to verify that the function has been deployed.
3. Use the **Test/Run** feature or trigger the endpoint manually to ensure everything works as expected.

---

By following these steps, you can create and deploy a new Azure Function for the F1 Fantazy Bot using the Azure portal and GitHub Actions.

