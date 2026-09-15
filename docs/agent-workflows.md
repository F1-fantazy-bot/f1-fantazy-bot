# Web workflows

Compound requests are always available through `propose_workflow` when this
code is deployed. No environment flag is required.

A proposal contains the full request, an optional conversation reference, and
1–10 ordered steps. Every step includes `id`, `tool`, literal `args`, and
`dependsOn` containing only earlier step IDs. The server resolves owned team
names and binds later implicit team targets to an earlier `select_team`.
Missing choices preserve the entire proposal in existing choice cards. To edit a paused workflow, propose its remaining steps with `workflowId` and `revision`; CAS increments the revision and removes the old execution authorization. Running or uncertain workflows cannot be edited.
Calculation-only `chipOverride` values never change the saved chip. A workflow calculation following chip selection binds that chip explicitly so the requested calculation cannot silently switch chips. Full message content is shown without truncation; broadcast recipient identities are available in expandable details.

Write preparation is shared with existing single-action tools. Preparation
returns canonical arguments, server-only commit metadata, and the existing
localized effect summary without staging individual nonces. Admin checks,
service rate limits, mutation locks, and service transactions remain in place.
The workflow registry supplies fresh preconditions, execution adapters, success
criteria, and conservative recovery policies. A calculation or condition that
changes a future message or recipient must be resolved before proposing that
write; the model must provide the final exact message, never a placeholder.

## Protocol and persistence

- The read-only `get_workflow_status` model tool supplies durable outcomes, current revisions, and calculation references for follow-up questions. It cannot approve or advance.
- `GET /api/agent/workflows` lists the authenticated owner's retained workflows.
- `POST /api/agent/workflow-decision` accepts `{id, revision, decision}` for
  `status`, `approve`, `cancel`, `resume`, or `advance`.
- `advance` also echoes the next `stepId`. This is an idempotency guard, not a
  client instruction to select a different step. The server independently
  checks it before and after acquiring the shared mutation boundary.
- Approval is accepted only by this authenticated HTTP endpoint. No model tool
  grants execution authorization. Approval expires five minutes after the
  preview was prepared. Expiry or material drift produces a new revision of
  only the remaining work. Completed writes are never repeated.
- `AgentWorkflows` Azure Table partitions by authenticated Telegram chat ID.
  Full-record ETag transitions claim execution before invocation. Result
  receipts preserve completed outcomes when a later workflow-state response
  is lost. Chunked JSON properties remain below Azure Table property limits;
  oversized records fail closed.
- A per-owner lease prevents workflows from interleaving across workers and
  tabs. The existing `runChipMutation` boundary serializes fresh validation,
  execution and downstream precondition capture with Telegram mutations.
- Results include their original calculation IDs. Existing recommendation
  fingerprint/expiry checks remain authoritative.
- Retention is 24 hours, with opportunistic owner-partition cleanup on listing.
  A browser refresh retrieves durable state and requires Resume; it does not
  reconstruct approval from local chat history.

## Failure semantics

The workflow is not a transaction. Completed changes remain saved when a later
step fails. Cancellation stops new claims; an already-running action can still
finish. Failed reads require explicit Resume. Uncertain writes never repeat.
Saved chip, active-team, ranking, and language operations can be reconciled
against authoritative state on Resume. External messages without delivery
proof remain outcome unknown. An abandoned claim becomes failed (read) or
outcome unknown (write) after five minutes.

Manual admin jobs display Started and pause the workflow: the current manual
trigger adapters expose a run reference, not a verified completion signal.
Dependent reads therefore do not run automatically. Material changes discovered
in a later destructive operation can require a revised remaining-work preview.

The UI uses a single durable workflow panel with numbered progress and shared
rich result renderers, English/Hebrew labels, RTL, responsive layout and live
status announcements. It requests one step per HTTP request, reads status
between steps, and stops automatic advancement on unmount or request failure.
Single-action confirmation tools and Telegram commands remain available.

## Validation and rollout

Run `npm test -- --runInBand`, `npm --prefix web test`, `npm run lint`, and
`npm --prefix web run build`. Workflow service, store, registry, API and component
tests cover ownership, revisions, CAS, duplicate requests, cancellation, partial
progress, expiry, target binding and hypothetical chips.

Validate changes with a dedicated test account in the Azure test slot: chip → calculation, cross-tab duplicate advance,
reload/resume, lost responses, Telegram state changes, admin revocation, and
message delivery failures. Inspect `agent_workflow` events by workflow ID,
revision and step ID. These events exclude arguments, approval credentials,
recipient lists and message bodies. Do not equate a model response or an
approval event with a successful step outcome.

## Local browser fixture

Run the web development server and open `/e2e/workflow-preview.html` (English)
or `/e2e/workflow-preview.html?lang=he` (Hebrew). The fixture uses the real card
and rich result renderer with synthetic outcomes and never sends messages or
changes live data. Approve simulates a successful chip write followed by a
failed calculation, preserving both outcomes. This fixture is not an Azure
integration test and is not included in the production entry-point build.
