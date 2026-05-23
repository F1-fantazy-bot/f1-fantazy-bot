// Factory + helpers for agent write tools.
//
// Every write tool follows the same protocol (see
// `src/services/pendingWritesStore.js`):
//
//   1. Propose — first call from the LLM. Tool validates args, stages
//      the pending intent under a server-issued `writeNonce`, returns
//      `{ status: 'confirmation_required', writeNonce, tool, summary,
//        args }`. NO side effect.
//   2. Confirm — second call via the shared `confirm_write` tool.
//      That tool consumes the intent and re-invokes the original
//      executor with the staged args.
//
// `defineWriteTool` builds the propose tool. The commit step is
// generic and lives in `confirm_write` (registered in
// `src/agent/tools.js`).
//
// Contract for write-tool implementations
// ---------------------------------------
// Each write tool exports a `commit({ chatId, args })` async function
// that performs the actual mutation and returns one of the standard
// result envelopes:
//
//   { status: 'ok', summary, ...details }
//   { status: 'invalid_input' | 'not_found' | 'forbidden'
//           | 'limit_exceeded', summary, ...details }
//
// `commit` MUST NOT throw for expected error cases — return a
// status-tagged envelope instead. Unexpected errors are caught by
// `wrapToolExecute` and surfaced as `tool_error`.

const { defineTool } = require('@copilotkit/runtime/v2');
const {
  stagePendingWrite,
  consumePendingWrite,
} = require('../services/pendingWritesStore');
const { getAgentChatId } = require('./identity');
const { ensureCacheReady } = require('./cacheBootstrap');
const { wrapToolExecute } = require('./wrapToolExecute');

const WRITE_RESULT_STATUSES = Object.freeze({
  CONFIRMATION_REQUIRED: 'confirmation_required',
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  LIMIT_EXCEEDED: 'limit_exceeded',
});

const WRITE_TOOL_REGISTRY = new Map();

function registerWriteTool(name, { commit }) {
  if (typeof commit !== 'function') {
    throw new Error(
      `registerWriteTool("${name}"): commit must be a function`,
    );
  }
  WRITE_TOOL_REGISTRY.set(name, { commit });
}

function getWriteToolCommitFor(name) {
  const entry = WRITE_TOOL_REGISTRY.get(name);

  return entry ? entry.commit : null;
}

function resetWriteToolRegistryForTests() {
  WRITE_TOOL_REGISTRY.clear();
}

// Build the propose tool for a write action.
//
//   defineWriteTool({
//     name, description, parameters,
//     validate({ chatId, args }) -> envelope | null,
//     buildSummary({ chatId, args }) -> string,
//     commit({ chatId, args }) -> envelope,
//   })
//
// - `parameters` is a Zod schema describing the propose-call args
//   (do NOT include `writeNonce` or `confirmed` — confirmation is
//   handled by the separate `confirm_write` tool).
// - `validate` runs synchronously OR async during propose. Returning
//   a non-null envelope short-circuits with that envelope (e.g.
//   `{ status: 'invalid_input', ... }`); returning null/undefined
//   means "OK, stage the intent". Async allowed for ownership checks
//   that need cache reads.
// - `buildSummary` produces the human-readable confirmation prompt
//   shown in `<WriteConfirmCard>`. Plain text; no markdown trick
//   required — the card renders it as-is.
// - `commit` performs the actual write when the user confirms via
//   `confirm_write`. Returns the final envelope.
function defineWriteTool({
  name,
  description,
  parameters,
  validate,
  buildSummary,
  commit,
}) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('defineWriteTool: name required');
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`defineWriteTool("${name}"): description required`);
  }
  if (!parameters || typeof parameters.parse !== 'function') {
    throw new Error(
      `defineWriteTool("${name}"): parameters must be a Zod schema`,
    );
  }
  if (typeof buildSummary !== 'function') {
    throw new Error(`defineWriteTool("${name}"): buildSummary required`);
  }
  if (typeof commit !== 'function') {
    throw new Error(`defineWriteTool("${name}"): commit required`);
  }

  registerWriteTool(name, { commit });

  const tool = defineTool({
    name,
    description,
    parameters,
    execute: wrapToolExecute(name, async (rawArgs) => {
      const chatId = getAgentChatId();
      await ensureCacheReady();

      // Always re-validate via the Zod schema so the staged intent
      // matches the declared shape (CopilotKit already parses args
      // before calling execute, but defensive normalization here
      // keeps `commit` simple).
      const args = parameters.parse(rawArgs ?? {});

      if (typeof validate === 'function') {
        const validation = await validate({ chatId, args });
        if (validation && typeof validation === 'object' && validation.status) {
          return validation;
        }
      }

      const summary = buildSummary({ chatId, args });
      const writeNonce = stagePendingWrite({
        chatId,
        tool: name,
        args,
        summary,
      });

      return {
        status: WRITE_RESULT_STATUSES.CONFIRMATION_REQUIRED,
        tool: name,
        writeNonce,
        summary,
        args,
      };
    }),
  });

  return tool;
}

// Internal — exported for `confirm_write` to call.
async function executeConfirmedWrite({ chatId, writeNonce }) {
  const intent = consumePendingWrite({ chatId, writeNonce });
  if (!intent) {
    return {
      status: WRITE_RESULT_STATUSES.NOT_FOUND,
      tool: 'confirm_write',
      summary:
        'No pending write found for that nonce. It may have expired, ' +
        'already been confirmed, or been issued for a different user.',
    };
  }

  const commit = getWriteToolCommitFor(intent.tool);
  if (!commit) {
    return {
      status: WRITE_RESULT_STATUSES.NOT_FOUND,
      tool: intent.tool,
      summary: `No registered commit handler for tool "${intent.tool}".`,
    };
  }

  await ensureCacheReady();
  const result = await commit({ chatId, args: intent.args });

  // Ensure every result carries a `tool` field so the UI can route
  // it to the right render hook.
  if (result && typeof result === 'object' && !result.tool) {
    return { ...result, tool: intent.tool };
  }

  return result;
}

module.exports = {
  defineWriteTool,
  executeConfirmedWrite,
  getWriteToolCommitFor,
  registerWriteTool,
  resetWriteToolRegistryForTests,
  WRITE_RESULT_STATUSES,
};
