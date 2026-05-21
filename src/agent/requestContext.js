// Per-request execution context for the web-chat agent.
//
// Tools run inside CopilotKit's `BuiltInAgent.execute()` callback, which
// is invoked SOMEWHERE deep inside the AI SDK's tool-dispatch loop. The
// runtime gives us no first-class way to thread per-request state down
// to a tool — `defineTool({ execute })` only receives the LLM-controlled
// `args` argument. That's intentional: the LLM must not be able to spoof
// identity.
//
// AsyncLocalStorage is the canonical Node solution. We wrap each incoming
// HTTP request in `runWithRequestContext({ chatId, email, sub }, fn)`;
// every async/Promise callback that descends from `fn` automatically
// inherits the same store. `getRequestContext()` reads it back inside
// tools.
//
// When no store is active (Telegram bot, cache bootstrap, tests, local
// dev with auth bypassed) `getRequestContext()` returns `undefined` —
// callers fall back to env (`AGENT_HARDCODED_CHAT_ID`).

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with the given request context attached. All async work
 * descending from `fn` sees the same context via `getRequestContext()`.
 *
 * @param {{ chatId: number, email?: string, sub?: string, name?: string }} ctx
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
function runWithRequestContext(ctx, fn) {
  return storage.run(ctx, fn);
}

/**
 * Read the active request context, or `undefined` if no
 * `runWithRequestContext` is on the stack.
 *
 * @returns {{ chatId: number, email?: string, sub?: string, name?: string }|undefined}
 */
function getRequestContext() {
  return storage.getStore();
}

module.exports = { runWithRequestContext, getRequestContext };
