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
  consumeApprovedPendingWrite,
  CONSUME_STATUS,
} = require('../services/pendingWritesStore');
const { getAgentChatId } = require('./identity');
const { t, getLanguage } = require('../i18n');
const {
  getFreshLanguagePreference,
} = require('../services/setLanguageService');
const { ensureCacheReady } = require('./cacheBootstrap');
const { wrapToolExecute } = require('./wrapToolExecute');

const WRITE_RESULT_STATUSES = Object.freeze({
  CONFIRMATION_REQUIRED: 'confirmation_required',
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  LIMIT_EXCEEDED: 'limit_exceeded',
  FAILED: 'failed',
});

const WRITE_TOOL_REGISTRY = new Map();

function registerWriteTool(name, { commit, propose }) {
  if (typeof commit !== 'function') {
    throw new Error(
      `registerWriteTool("${name}"): commit must be a function`,
    );
  }
  if (propose !== undefined && typeof propose !== 'function') {
    throw new Error(
      `registerWriteTool("${name}"): propose must be a function`,
    );
  }
  WRITE_TOOL_REGISTRY.set(name, { commit, propose });
}

function getWriteToolCommitFor(name) {
  const entry = WRITE_TOOL_REGISTRY.get(name);

  return entry ? entry.commit : null;
}

function getWriteToolProposalFor(name) {
  const entry = WRITE_TOOL_REGISTRY.get(name);

  return entry?.propose || null;
}

async function proposeRegisteredWrite({ chatId, tool, args }) {
  const propose = getWriteToolProposalFor(tool);
  if (!propose) {
    return null;
  }

  return await propose({ chatId, rawArgs: args });
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
//   means "OK, stage the intent". It may instead return
//   `{ args: canonicalArgs, summary?: validatedSummary,
//      intentArgs?: serializableCommitArgs }` to stage an
//   ownership-validated, canonical intent. `summary` is useful when
//   validation discovers side effects that are deliberately not part of the
//   displayed args. `intentArgs` may add server-derived commit metadata and
//   is never accepted from the LLM. Async allowed for ownership checks that
//   need cache reads.
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

  const propose = async ({ chatId, rawArgs }) => {
    await ensureCacheReady();

    // Always re-validate via the Zod schema so the staged intent
    // matches the declared shape (CopilotKit already parses args
    // before calling execute, but defensive normalization here
    // keeps `commit` simple).
    let parsedArgs = parameters.parse(rawArgs ?? {});
    let validatedSummary = null;
    let intentArgs = null;

    if (typeof validate === 'function') {
      const validation = await validate({ chatId, args: parsedArgs });
      if (validation && typeof validation === 'object' && validation.status) {
        return { ...validation, uiLang: getLanguage(chatId) };
      }
      if (validation && typeof validation === 'object' && validation.args) {
        parsedArgs = parameters.parse(validation.args);
        if (typeof validation.summary === 'string') {
          validatedSummary = validation.summary;
        }
        if (
          validation.intentArgs &&
          typeof validation.intentArgs === 'object' &&
          !Array.isArray(validation.intentArgs)
        ) {
          intentArgs = validation.intentArgs;
        }
      }
    }

    const summary =
      validatedSummary || buildSummary({ chatId, args: parsedArgs });
    const writeNonce = await stagePendingWrite({
      chatId,
      tool: name,
      args: intentArgs || parsedArgs,
      summary,
    });

    return {
      status: WRITE_RESULT_STATUSES.CONFIRMATION_REQUIRED,
      tool: name,
      writeNonce,
      summary,
      args: parsedArgs,
      uiLang: getLanguage(chatId),
    };
  };

  registerWriteTool(name, { commit, propose });

  const tool = defineTool({
    name,
    description,
    parameters,
    execute: wrapToolExecute(name, async (rawArgs) =>
      propose({ chatId: getAgentChatId(), rawArgs }),
    ),
  });

  return tool;
}

// Internal — exported for `confirm_write` to call.
async function executeConfirmedWrite({ chatId, writeNonce }) {
  await ensureCacheReady();
  const { lang: initialUiLang } = await getFreshLanguagePreference(chatId);
  const consumed = await consumeApprovedPendingWrite({
    chatId,
    writeNonce,
  });
  if (consumed.status === CONSUME_STATUS.NOT_APPROVED) {
    return {
      status: WRITE_RESULT_STATUSES.FORBIDDEN,
      tool: 'confirm_write',
      uiLang: initialUiLang,
      summary: t(
        'This change has not been approved in the confirmation card. Ask the user to click Yes before trying again.',
        chatId,
      ),
    };
  }
  if (consumed.status !== CONSUME_STATUS.CONSUMED) {
    return {
      status: WRITE_RESULT_STATUSES.NOT_FOUND,
      tool: 'confirm_write',
      uiLang: initialUiLang,
      summary: t(
        'No pending write found for that nonce. It may have expired, already been confirmed, or been issued for a different user.',
        chatId,
      ),
    };
  }
  const { intent } = consumed;

  const commit = getWriteToolCommitFor(intent.tool);
  if (!commit) {
    return {
      status: WRITE_RESULT_STATUSES.NOT_FOUND,
      tool: intent.tool,
      uiLang: initialUiLang,
      summary: t(
        'No registered commit handler for tool "{TOOL}".',
        chatId,
        { TOOL: intent.tool },
      ),
    };
  }

  const result = await commit({ chatId, args: intent.args });

  // Ensure every result carries routing + localization metadata for the
  // shared result card.
  if (result && typeof result === 'object') {
    return {
      ...result,
      tool: result.tool || intent.tool,
      uiLang: getLanguage(chatId),
    };
  }

  return result;
}

module.exports = {
  defineWriteTool,
  executeConfirmedWrite,
  getWriteToolCommitFor,
  getWriteToolProposalFor,
  proposeRegisteredWrite,
  registerWriteTool,
  resetWriteToolRegistryForTests,
  WRITE_RESULT_STATUSES,
};
