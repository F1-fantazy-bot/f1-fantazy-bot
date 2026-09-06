#!/usr/bin/env bash
# infra/agent-func/ensure-manual-trigger-role.sh
#
# One-time/bootstrap RBAC configuration for the five agent-exposed manual
# Logic App triggers. It grants each agent slot identity Logic App Contributor
# on the exact workflow resources, never at subscription or resource-group
# scope.
#
# Invocation: bash infra/agent-func/ensure-manual-trigger-role.sh
# Optional environment:
#   AZURE_SUBSCRIPTION_ID (default: 5cfc4033-d828-4bdb-b9ea-de042e483715)
#   RESOURCE_GROUP        (default: f1-fantazy-bot)
#   FUNCTIONAPP_NAME      (default: f1-fantazy-agent-func)
#   AGENT_ROLE_SLOT       (both | production | test; default: both)

set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-5cfc4033-d828-4bdb-b9ea-de042e483715}"
RG="${RESOURCE_GROUP:-f1-fantazy-bot}"
APP="${FUNCTIONAPP_NAME:-f1-fantazy-agent-func}"
AGENT_ROLE_SLOT="${AGENT_ROLE_SLOT:-both}"
ROLE_NAME="Logic App Contributor"

# Keep this list in lockstep with MANUAL_TRIGGERS in
# src/manualTriggerService.js. The accompanying Jest test prevents drift.
WORKFLOWS=(
  "f1-fantasy-scraper-runner"
  "f1-fantasy-api-data-runner"
  "f1-fantasy-api-data-runner-locked"
  "f1-fantasy-next-race-info-scheduler"
  "f1-fantasy-live-score-scheduler"
)

get_principal_id() {
  local slot_label="$1"
  local slot_args=()

  if [[ "$slot_label" != "production" ]]; then
    slot_args+=(--slot "$slot_label")
  fi

  az functionapp identity show \
    --name "$APP" \
    --resource-group "$RG" \
    --subscription "$SUB" \
    ${slot_args[@]+"${slot_args[@]}"} \
    --query principalId -o tsv
}

ensure_workflow_role() {
  local slot_label="$1"
  local principal_id="$2"
  local workflow="$3"
  local scope="/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Logic/workflows/${workflow}"
  local existing_assignment

  existing_assignment=$(az role assignment list \
    --subscription "$SUB" \
    --assignee-object-id "$principal_id" \
    --scope "$scope" \
    --query "[?roleDefinitionName == '${ROLE_NAME}'] | [0].id" \
    -o tsv)

  if [[ -n "$existing_assignment" ]]; then
    echo "${ROLE_NAME} already assigned to ${slot_label} for ${workflow}."
    return
  fi

  echo "Granting ${ROLE_NAME} to ${slot_label} for ${workflow}..."
  az role assignment create \
    --subscription "$SUB" \
    --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role "$ROLE_NAME" \
    --scope "$scope" \
    --only-show-errors \
    --output none
}

ensure_slot_roles() {
  local slot_label="$1"
  local principal_id

  principal_id=$(get_principal_id "$slot_label")
  if [[ -z "$principal_id" ]]; then
    echo "Unable to resolve the ${slot_label} slot managed identity." >&2
    return 1
  fi

  for workflow in "${WORKFLOWS[@]}"; do
    ensure_workflow_role "$slot_label" "$principal_id" "$workflow"
  done
}

case "$AGENT_ROLE_SLOT" in
  both)
    ensure_slot_roles "production"
    ensure_slot_roles "test"
    ;;
  production|test)
    ensure_slot_roles "$AGENT_ROLE_SLOT"
    ;;
  *)
    echo "AGENT_ROLE_SLOT must be one of: both, production, test." >&2
    exit 1
    ;;
esac

echo "Done. Agent manual-trigger roles are configured."
