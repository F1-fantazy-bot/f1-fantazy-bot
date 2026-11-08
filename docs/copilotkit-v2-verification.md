# CopilotKit v2 and parallel tools verification

Local implementation on `feature/doronkilzi/copilotkit-v2-parallel-tools`,
starting from updated main `bbe65e8d7c3a3e4729bcc6f85c8d240fb7c11bf8`.
The branch was subsequently updated from main `cda30c3` before PR creation.
All local write outcomes were synthetic; no live write was performed.

## Upgrade and behavior

- Backend runtime and frontend react-core are pinned to **1.85.0**;
  `react-ui` is removed. Direct AG-UI client/core imports use **1.0.2** and
  Zod **3.25.76** is explicit. Both lockfiles install cleanly on Node **22.22.3**.
  Public npm registry selection was command-scoped; no peer bypasses were used.
- The frontend uses `CopilotKitProvider`, v2 chat/styles/message slots, and
  render-only `useRenderTool` registrations. The shared pass-through parameter
  schema retains choice and workflow arguments without registering executors.
- Single-endpoint transport, `default` agent, dynamic authorization headers,
  account-scoped local history, confirmation decisions, and workflow placement
  remain. Restored tool cards are display data and cannot execute or approve.
- Independent parallel calls are enabled after the v2 regression pass.
  The model, Azure provider, AI SDK 6, five-step limit, medium reasoning,
  `store: false`, developer-message forwarding, and sequential workflow approval,
  nonce and mutation-lock boundaries remain.
- Runtime in-memory threads are bound to the verified Google subject, with
  server-resolved chat identity for local bypass. Foreign accounts receive no
  replayed messages and cannot continue another owner's thread.
- Rapid confirmation clicks are synchronously guarded. Mobile race tables have
  keyboard-accessible horizontal scrolling; v2 theme tokens and Hebrew message
  and input direction use the application palette and current markup.

API signatures were checked against the pinned package declarations and the
[official migration guide](https://docs.copilotkit.ai/migrate/v2).

## Results

| Check | Before upgrade | Final local result |
| --- | --- | --- |
| Backend Jest | 191 suites / 1,812 tests passed | 192 suites / 1,813 tests passed |
| Backend coverage | Baseline tests recorded | 89.18% statements, 79.21% branches, 88.62% functions, 89.50% lines |
| Frontend Vitest | 38 files / 421 tests passed | 39 files / 422 tests passed |
| Playwright | Desktop/mobile screenshots captured | 72 cases passed across 8 language/theme/viewport projects |
| Production build | Passed, chunk-size warning | Passed, chunk-size warning |
| ESLint | No errors, 11 warnings | No errors, same 11 warnings |
| Clean installs / dependency tree | Existing installs used for baseline | Both `npm ci` passed; AG-UI 1.0.2 deduplicated; React 18 retained |
| Whitespace | Clean starting tree | `git diff --check` passed |

The real-provider Vitest integration keeps the v2 provider, chat, AG-UI parser
and rich renderers intact. It verifies same-mounted-provider token replacement,
multiple tools in one assistant message, repeated calls, out-of-order results,
and final responses. Only the network boundary is synthetic.

The backend subprocess test uses the real runtime handler, BuiltInAgent,
Azure Responses provider and AI SDK. Controlled model SSE completes independent
calls out of order, returns every result by call ID, continues dependent calls,
forwards hidden messages, produces final prose, and isolates concurrent owners.
It also checks runtime replay/list/connect/run access across different Google
subjects, including two subjects mapped to the same Telegram chat ID.

Playwright runs the actual application against a local streaming AG-UI fixture.
It covers repeated prompts, pending/empty/failed results, stream failure,
cancellation, reload without replay/duplicates, all 52 renderer fixtures,
confirm/cancel/expiry, rapid clicks, workflow failure/recovery/clear,
choices and recommendation-row arguments, refreshed credentials on reload,
account changes, sign-out and 401 rejection. Keyboard input, table scrolling,
page overflow, screenshots, page errors, and transport requests are checked.
Successful workflow cards recover from the durable-status fixture separately
from the other 51 cached renderer results.

Baseline screenshots are at `/tmp/f1-upgrade-baseline/`.
Final screenshots and failure-only traces are generated under
`web/test-results/` (ignored by Git). Desktop light and Hebrew mobile dark
screenshots were visually inspected, including table readability and focus.

After the main update, all **435 frontend tests**, **28 calculation-snapshot
tests**, the production build, and four focused English desktop / Hebrew mobile
browser cases passed. The table above records the full migration checkpoint
before that update; required commit-hook coverage runs against the final tree.

## Reproduce

Use Node 22 and install the browser once:

```sh
npm ci --registry=https://registry.npmjs.org
npm --prefix web ci --registry=https://registry.npmjs.org
(cd web && npx playwright install chromium)
COPILOTKIT_TELEMETRY_DISABLED=true npm run test:coverage -- --runInBand
npm run lint
npm --prefix web test
npm --prefix web run build
npm --prefix web run test:browser
git diff --check
```

The browser command starts its own Vite and synthetic API servers on
127.0.0.1:5179 and 127.0.0.1:7079. It uses synthetic JWTs and outcomes; it never
uses the local `.env` backend credentials or sends real messages, broadcasts,
or scraper triggers.

## Remaining rollout gates

These results do not verify live Azure model output, Google token renewal,
allowlist/storage access, or streaming flush behavior on Azure Functions.
Authenticated staging smoke tests and CI remain required after an explicitly
requested PR/deployment, with both existing test deployments checked against
the intended commit. Production health and read-only smoke tests follow an
authorized merge. No staging or production result is claimed here.

Install audit summaries still report dependency advisories (65 backend,
32 frontend). No unrelated audit fix or peer-dependency bypass was applied.

If only parallel execution regresses, set `parallelToolCalls` back to `false`.
If the migration/protocol regresses, revert the coordinated frontend/backend
upgrade. Keep dependent writes inside their existing ordered workflows.
