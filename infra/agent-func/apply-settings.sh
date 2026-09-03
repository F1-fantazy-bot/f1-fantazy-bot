#!/usr/bin/env bash
# infra/agent-func/apply-settings.sh
#
# Idempotently configures f1-fantazy-agent-func (BOTH slots). It sets
# app settings using `az functionapp config appsettings set --settings`, which
# is ADDITIVE: it only touches the keys passed via --settings; everything else
# (notably WEBSITE_RUN_FROM_PACKAGE set by the GH deploy action) is preserved.
# It also ensures each slot's system-assigned identity can read Cost Management
# data for the configured subscription.
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
#   AZURE_OPEN_AI_MODEL    (default: gpt-5.6-terra)
#   PROD_ALLOWED_ORIGINS   (default: https://calm-beach-055be4603.7.azurestaticapps.net)
#   PROD_PREVIEW_PATTERN   (default: empty)
#   TEST_ALLOWED_ORIGINS   (default: https://test.f1.kilzid.com,https://proud-sky-035c6b003.7.azurestaticapps.net)
#   TEST_PREVIEW_PATTERN   (default: empty)
#   GOOGLE_CLIENT_ID       OAuth 2.0 Web client ID. When set, enables Google
#                           sign-in on BOTH the production AND test slots. The
#                           test slot additionally runs an admin-only filter —
#                           see AGENT_REQUIRE_ADMIN below.
#                           When unset, this script preserves any existing
#                           GOOGLE_CLIENT_ID app setting instead of clearing it.
#   ALLOW_EMPTY_GOOGLE_CLIENT_ID
#                           Set to "true" only when you intentionally want to
#                           write an empty GOOGLE_CLIENT_ID and disable auth.

set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-5cfc4033-d828-4bdb-b9ea-de042e483715}"
RG="${RESOURCE_GROUP:-f1-fantazy-bot}"
APP="${FUNCTIONAPP_NAME:-f1-fantazy-agent-func}"
KV_NAME="${KEY_VAULT_NAME:-f1-fantasy-kv}"
STORAGE_NAME="${STORAGE_ACCOUNT_NAME:-f1fantazybot9eca}"
APPINSIGHTS_NAME="${APPINSIGHTS_NAME:-f1-fantazy-bot-func}"
MODEL="${AZURE_OPEN_AI_MODEL:-gpt-5.6-terra}"
STORAGE_CONTAINER="${AZURE_STORAGE_CONTAINER_NAME:-f1-fantasy-scraper-json}"
PROD_ORIGINS="${PROD_ALLOWED_ORIGINS:-https://calm-beach-055be4603.7.azurestaticapps.net}"
PROD_PATTERN="${PROD_PREVIEW_PATTERN:-}"
# The test slot frontend lives at the dedicated test SWA — see
# `infra/agent-web-test/` and `pr_test_f1-fantazy-agent-web.yml`. The
# user-facing URL is the custom domain (test.f1.kilzid.com); the raw
# SWA hostname is included as defense-in-depth in case someone hits
# it directly bypassing DNS. This is the only CORS we need now — no
# per-PR origin churn.
TEST_ORIGINS="${TEST_ALLOWED_ORIGINS:-https://test.f1.kilzid.com,https://proud-sky-035c6b003.7.azurestaticapps.net}"
TEST_PATTERN="${TEST_PREVIEW_PATTERN:-}"
# When set, the Google auth gate runs on BOTH slots. The test slot
# additionally requires AGENT_REQUIRE_ADMIN=true (see below) so only
# admin chatIds (KILZI/DORSE) can reach the agent on PR previews.
PROD_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
TEST_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
ALLOW_EMPTY_GOOGLE_CLIENT_ID="${ALLOW_EMPTY_GOOGLE_CLIENT_ID:-false}"

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
  local google_client_id="$4"
  local require_admin="$5"
  local slot_args=()

  if [[ "$slot_label" != "production" ]]; then
    slot_args+=(--slot "$slot_label")
  fi

  local settings=(
    "FUNCTIONS_EXTENSION_VERSION=~4"
    "FUNCTIONS_WORKER_RUNTIME=node"
    "WEBSITE_NODE_DEFAULT_VERSION=~22"
    "NODE_ENV=production"
    "LOG_ENV=${slot_label}"
    # Azure Cost Management requires the target subscription at runtime. This is
    # an identifier, not a credential; DefaultAzureCredential uses the slot MSI.
    "AZURE_SUBSCRIPTION_ID=${SUB}"
    "AZURE_OPEN_AI_MODEL=${MODEL}"
    "AZURE_STORAGE_CONTAINER_NAME=${STORAGE_CONTAINER}"
    "AZURE_OPENAI_ENDPOINT=@Microsoft.KeyVault(SecretUri=${KV_BASE}/azure-openai-endpoint/)"
    "AZURE_OPENAI_API_KEY=@Microsoft.KeyVault(SecretUri=${KV_BASE}/azure-openai-api-key/)"
    "AZURE_STORAGE_CONNECTION_STRING=@Microsoft.KeyVault(SecretUri=${KV_BASE}/azure-storage-connection-string/)"
    "TELEGRAM_BOT_TOKEN=@Microsoft.KeyVault(SecretUri=${KV_BASE}/telegram-bot-token/)"
    "AGENT_HARDCODED_CHAT_ID=@Microsoft.KeyVault(SecretUri=${KV_BASE}/agent-hardcoded-chat-id/)"
    "AGENT_CORS_ALLOWED_ORIGINS=${cors_origins}"
    "AGENT_CORS_PREVIEW_ORIGIN_PATTERN=${cors_pattern}"
    "AGENT_REQUIRE_ADMIN=${require_admin}"
    "AzureWebJobsStorage=${STORAGE_CS}"
    "APPLICATIONINSIGHTS_CONNECTION_STRING=${APPINSIGHTS_CS}"
  )

  if [[ -n "$google_client_id" || "$ALLOW_EMPTY_GOOGLE_CLIENT_ID" == "true" ]]; then
    settings+=("GOOGLE_CLIENT_ID=${google_client_id}")
  else
    echo "GOOGLE_CLIENT_ID is unset; preserving existing ${slot_label} app setting."
  fi

  echo "Applying app settings to slot: ${slot_label}..."
  # Note: ${slot_args[@]+"${slot_args[@]}"} pattern is `set -u`-safe expansion
  # of a possibly-empty array (Bash treats `${empty_array[@]}` as unbound).
  az functionapp config appsettings set \
    --name "$APP" \
    --resource-group "$RG" \
    --subscription "$SUB" \
    ${slot_args[@]+"${slot_args[@]}"} \
    --settings "${settings[@]}" \
    --output none --only-show-errors
}

ensure_cost_management_reader() {
  local slot_label="$1"
  local slot_args=()

  if [[ "$slot_label" != "production" ]]; then
    slot_args+=(--slot "$slot_label")
  fi

  local principal_id
  principal_id=$(az functionapp identity show \
    --name "$APP" \
    --resource-group "$RG" \
    --subscription "$SUB" \
    ${slot_args[@]+"${slot_args[@]}"} \
    --query principalId -o tsv)

  if [[ -z "$principal_id" ]]; then
    echo "Unable to resolve the ${slot_label} slot managed identity." >&2
    return 1
  fi

  local role_scope="/subscriptions/${SUB}"
  local existing_assignment
  existing_assignment=$(az role assignment list \
    --assignee-object-id "$principal_id" \
    --scope "$role_scope" \
    --query "[?roleDefinitionName == 'Cost Management Reader'] | [0].id" \
    -o tsv)

  if [[ -n "$existing_assignment" ]]; then
    echo "Cost Management Reader already assigned to ${slot_label} slot."
    return
  fi

  echo "Granting Cost Management Reader to ${slot_label} slot..."
  az role assignment create \
    --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role "Cost Management Reader" \
    --scope "$role_scope" \
    --only-show-errors \
    --output none
}

# Production: full Google sign-in + allowlist; everyone on the
# WebUserAllowlist can chat as themselves.
apply_to_slot "production" "$PROD_ORIGINS" "$PROD_PATTERN" "$PROD_GOOGLE_CLIENT_ID" "false"
# Test slot: same Google client + same allowlist, BUT an additional
# admin-only filter (AGENT_REQUIRE_ADMIN=true) — the test slot is
# locked down to admin chatIds (KILZI/DORSE) per
# src/agent/auth.js#isAdminChatId. Non-admin allowlisted users still
# work on prod; the test slot returns FORBIDDEN reason=not_admin.
apply_to_slot "test"       "$TEST_ORIGINS" "$TEST_PATTERN" "$TEST_GOOGLE_CLIENT_ID" "true"

# Each deployment slot has an independent system-assigned managed identity.
# The billing tool queries subscription-level Cost Management data, so both
# identities need this read-only built-in role.
ensure_cost_management_reader "production"
ensure_cost_management_reader "test"

echo "Done. WEBSITE_RUN_FROM_PACKAGE and other externally-managed settings are preserved."
