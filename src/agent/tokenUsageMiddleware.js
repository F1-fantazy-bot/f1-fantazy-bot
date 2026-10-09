// Token-usage logging middleware for the web-chat agent.
//
// CopilotKit v2's `BuiltInAgent` does NOT expose an `onFinish` or
// `onStepFinish` hook on the model layer, so we attach to the LLM via an
// AI SDK v3 middleware (`LanguageModelV3Middleware`) and observe the raw
// stream coming back from Azure. Each LLM round-trip emits exactly one
// `finish` chunk carrying a `LanguageModelV3Usage` object. A single agent
// turn with N tool calls produces up to N+1 finish chunks (one per step),
// so we log per-step rather than per-turn — that's the granularity the
// underlying API exposes.
//
// IMPORTANT — usage shape:
// The V3 spec changed the usage shape from V2's flat `{ promptTokens,
// completionTokens, totalTokens }` to a NESTED shape:
//   usage.inputTokens.total      (prompt tokens)
//   usage.outputTokens.total     (completion tokens)
//   usage.outputTokens.reasoning (included in completion tokens)
// There is no aggregated `totalTokens` — we compute it ourselves. Any of
// the totals may be `undefined`, in which case we substitute 0. Missing
// reasoning usage is logged as n/a rather than implying zero reasoning.
//
// Logging is wrapped in try/catch with sync + async failure handling
// because a Telegram send error MUST NOT break the LLM stream the
// CopilotKit runtime is piping back to the browser.

const { sendLogMessage, sendErrorMessage } = require('../utils/utils');
const { getRequestContext } = require('./requestContext');

function safeTotal(field) {
  if (!field || typeof field !== 'object') {
    return 0;
  }
  const value = field.total;

  return Number.isFinite(value) ? value : 0;
}

function formatLine({
  modelId,
  step,
  prompt,
  completion,
  reasoning = 'n/a',
  total,
  email,
}) {
  const tail = email ? `\nemail: ${email}` : '';

  return `Agent step usage — model: ${modelId}, step: ${step}, prompt: ${prompt}, completion: ${completion}, reasoning: ${reasoning}, total: ${total}${tail}`;
}

function reportModelError(bot, modelId, error) {
  if (error?.name === 'AbortError') {
    return;
  }
  const detail = String(error?.message || error || 'Unknown model error').slice(
    0,
    1500,
  );
  const status = Number.isInteger(error?.statusCode)
    ? `, status: ${error.statusCode}`
    : '';
  const email = (getRequestContext() || {}).email;
  const line = `Agent model error — model: ${modelId}${status}, error: ${detail}${email ? `\nemail: ${email}` : ''}`;
  // Report only the message/status, never the SDK error's request body or headers.
  console.error(`AGENT: ${line}`);
  try {
    Promise.resolve(sendErrorMessage(bot, line)).catch((err) => {
      console.error('AGENT: model error log failed:', err);
    });
  } catch (err) {
    console.error('AGENT: model error log threw synchronously:', err);
  }
}

// `bot` is supplied by the runtime when the middleware is constructed so
// that tests can inject a mock notifier bot.
function createTokenUsageMiddleware({ bot }) {
  return {
    specificationVersion: 'v3',
    wrapStream: async ({ doStream, model }) => {
      const modelId = model && model.modelId ? model.modelId : 'unknown';
      let stepIndex = 0;
      let result;
      try {
        result = await doStream();
      } catch (error) {
        reportModelError(bot, modelId, error);
        throw error;
      }

      const observer = new TransformStream({
        transform(chunk, controller) {
          if (chunk && chunk.type === 'error') {
            reportModelError(bot, modelId, chunk.error);
          }
          if (chunk && chunk.type === 'finish') {
            stepIndex += 1;
            const prompt = safeTotal(chunk.usage && chunk.usage.inputTokens);
            const completion = safeTotal(
              chunk.usage && chunk.usage.outputTokens,
            );
            const reasoningTokens = chunk.usage?.outputTokens?.reasoning;
            const reasoning = Number.isFinite(reasoningTokens)
              ? reasoningTokens
              : 'n/a';
            // Reasoning is already included in outputTokens.total.
            const total = prompt + completion;
            const email = (getRequestContext() || {}).email;
            const line = formatLine({
              modelId,
              step: stepIndex,
              prompt,
              completion,
              reasoning,
              total,
              email,
            });

            // Fire-and-forget. We deliberately do NOT await here — the
            // stream must keep flowing to the client even if Telegram is
            // slow / down. We attach a .catch so an unhandled rejection
            // never bubbles up and kills the process.
            try {
              Promise.resolve(sendLogMessage(bot, line)).catch((err) => {
                console.error('AGENT: token usage log failed:', err);
              });
            } catch (err) {
              console.error('AGENT: token usage log threw synchronously:', err);
            }
          }

          controller.enqueue(chunk);
        },
      });

      return {
        ...result,
        stream: result.stream.pipeThrough(observer),
      };
    },
  };
}

module.exports = { createTokenUsageMiddleware, formatLine, safeTotal };
