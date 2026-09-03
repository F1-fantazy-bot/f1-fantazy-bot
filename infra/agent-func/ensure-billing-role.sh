#!/usr/bin/env bash
# infra/agent-func/ensure-billing-role.sh
#
# One-time/bootstrap RBAC configuration for the agent Function identities.
# This is intentionally separate from apply-settings.sh and routine deployment
# workflows because it requires permission to read and create subscription-level
# role assignments.
#
# Invocation: bash infra/agent-func/ensure-billing-role.sh
# Required env (or use defaults documented below):
#   AZURE_SUBSCRIPTION_ID  (default: 5cfc4033-d828-4bdb-b9ea-de042e483715)
#   RESOURCE_GROUP         (default: f1-fantazy-bot)
#   FUNCTIONAPP_NAME       (default: f1-fantazy-agent-func)
#   AGENT_ROLE_SLOT        `both` (default), `production`, or `test`.

set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-5cfc4033-d828-4bdb-b9ea-de042e483715}"
RG="${RESOURCE_GROUP:-f1-fantazy-bot}"
APP="${FUNCTIONAPP_NAME:-f1-fantazy-agent-func}"
AGENT_ROLE_SLOT="${AGENT_ROLE_SLOT:-both}"

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
    --subscription "$SUB" \
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
    --subscription "$SUB" \
    --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role "Cost Management Reader" \
    --scope "$role_scope" \
    --only-show-errors \
    --output none
}

case "$AGENT_ROLE_SLOT" in
  both)
    ensure_cost_management_reader "production"
    ensure_cost_management_reader "test"
    ;;
  production|test)
    ensure_cost_management_reader "$AGENT_ROLE_SLOT"
    ;;
  *)
    echo "AGENT_ROLE_SLOT must be one of: both, production, test." >&2
    exit 1
    ;;
esac

echo "Done. Agent billing roles are configured."
