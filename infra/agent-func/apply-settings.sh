#!/usr/bin/env bash
# infra/agent-func/apply-settings.sh
#
# Idempotently sets app settings on f1-fantazy-agent-func (BOTH slots).
# Safe to re-run any number of times — uses `az functionapp config
# appsettings set --settings`, which is ADDITIVE: it only touches the
# keys passed via --settings; everything else (notably
# WEBSITE_RUN_FROM_PACKAGE set by the GH deploy action) is preserved.
#
# This script is the canonical owner of agent app settings. The ARM
# template (azuredeploy.json) intentionally does NOT manage appSettings —
# putting any value in `siteConfig.appSettings` would replace the entire
# array on each ARM re-apply, wiping externally-managed settings. See
# the comment block on the Microsoft.Web/sites resource for the full
# rationale.
#
# Invocation: bash infra/agent-func/apply-settings.sh
# Required env (or use defaults documented below):
#   AZURE_SUBSCRIPTION_ID  (default: 5cfc4033-d828-4bdb-b9ea-de042e483715)
#   RESOURCE_GROUP         (default: f1-fantazy-bot)
#   FUNCTIONAPP_NAME       (default: f1-fantazy-agent-func)
#   KEY_VAULT_NAME         (default: f1-fantasy-kv)
#   STORAGE_ACCOUNT_NAME   (default: f1fantazybot9eca)
#   APPINSIGHTS_NAME       (default: f1-fantazy-bot-func)
#   AZURE_OPEN_AI_MODEL    (default: gpt-5.4)
#   PROD_ALLOWED_ORIGINS   (default: https://calm-beach-055be4603.7.azurestaticapps.net)
#   PROD_PREVIEW_PATTERN   (default: empty)
#   TEST_ALLOWED_ORIGINS   (default: *)
#   TEST_PREVIEW_PATTERN   (default: empty)

set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-5cfc4033-d828-4bdb-b9ea-de042e483715}"
RG="${RESOURCE_GROUP:-f1-fantazy-bot}"
APP="${FUNCTIONAPP_NAME:-f1-fantazy-agent-func}"
KV_NAME="${KEY_VAULT_NAME:-f1-fantasy-kv}"
STORAGE_NAME="${STORAGE_ACCOUNT_NAME:-f1fantazybot9eca}"
APPINSIGHTS_NAME="${APPINSIGHTS_NAME:-f1-fantazy-bot-func}"
MODEL="${AZURE_OPEN_AI_MODEL:-gpt-5.4}"
STORAGE_CONTAINER="${AZURE_STORAGE_CONTAINER_NAME:-f1-fantasy-scraper-json}"
PROD_ORIGINS="${PROD_ALLOWED_ORIGINS:-https://calm-beach-055be4603.7.azurestaticapps.net}"
PROD_PATTERN="${PROD_PREVIEW_PATTERN:-}"
TEST_ORIGINS="${TEST_ALLOWED_ORIGINS:-*}"
TEST_PATTERN="${TEST_PREVIEW_PATTERN:-}"

KV_BASE="https://${KV_NAME}.vault.azure.net/secrets"

echo "Resolving runtime values..."
STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_NAME" \
  --resource-group "$RG" \
  --subscription "$SUB" \
  --query '[0].value' -o tsv)
STORAGE_CS="DefaultEndpointsProtocol=https;AccountName=${STORAGE_NAME};AccountKey=${STORAGE_KEY};EndpointSuffix=core.windows.net"

APPINSIGHTS_CS=$(az resource show \
  --resource-group "$RG" \
  --subscription "$SUB" \
  --name "$APPINSIGHTS_NAME" \
  --resource-type "Microsoft.Insights/components" \
  --query "properties.ConnectionString" -o tsv)

apply_to_slot() {
  local slot_label="$1"
  local cors_origins="$2"
  local cors_pattern="$3"
  local slot_args=()

  if [[ "$slot_label" != "production" ]]; then
    slot_args+=(--slot "$slot_label")
  fi

  echo "Applying app settings to slot: ${slot_label}..."
  # Note: ${slot_args[@]+"${slot_args[@]}"} pattern is `set -u`-safe expansion
  # of a possibly-empty array (Bash treats `${empty_array[@]}` as unbound).
  az functionapp config appsettings set \
    --name "$APP" \
    --resource-group "$RG" \
    --subscription "$SUB" \
    ${slot_args[@]+"${slot_args[@]}"} \
    --settings \
      "FUNCTIONS_EXTENSION_VERSION=~4" \
      "FUNCTIONS_WORKER_RUNTIME=node" \
      "WEBSITE_NODE_DEFAULT_VERSION=~22" \
      "NODE_ENV=production" \
      "AZURE_OPEN_AI_MODEL=${MODEL}" \
      "AZURE_STORAGE_CONTAINER_NAME=${STORAGE_CONTAINER}" \
      "AZURE_OPENAI_ENDPOINT=@Microsoft.KeyVault(SecretUri=${KV_BASE}/azure-openai-endpoint/)" \
      "AZURE_OPENAI_API_KEY=@Microsoft.KeyVault(SecretUri=${KV_BASE}/azure-openai-api-key/)" \
      "AZURE_STORAGE_CONNECTION_STRING=@Microsoft.KeyVault(SecretUri=${KV_BASE}/azure-storage-connection-string/)" \
      "TELEGRAM_BOT_TOKEN=@Microsoft.KeyVault(SecretUri=${KV_BASE}/telegram-bot-token/)" \
      "AGENT_HARDCODED_CHAT_ID=@Microsoft.KeyVault(SecretUri=${KV_BASE}/agent-hardcoded-chat-id/)" \
      "AGENT_CORS_ALLOWED_ORIGINS=${cors_origins}" \
      "AGENT_CORS_PREVIEW_ORIGIN_PATTERN=${cors_pattern}" \
      "AzureWebJobsStorage=${STORAGE_CS}" \
      "APPLICATIONINSIGHTS_CONNECTION_STRING=${APPINSIGHTS_CS}" \
    --output none --only-show-errors
}

apply_to_slot "production" "$PROD_ORIGINS" "$PROD_PATTERN"
apply_to_slot "test"       "$TEST_ORIGINS" "$TEST_PATTERN"

echo "Done. WEBSITE_RUN_FROM_PACKAGE and other externally-managed settings are preserved."
