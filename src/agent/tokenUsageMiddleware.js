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
// There is no aggregated `totalTokens` — we compute it ourselves. Any of
// these fields may be `undefined`, in which case we substitute 0 so the
// log line still renders cleanly.
//
// Logging is wrapped in try/catch with sync + async failure handling
// because a Telegram send error MUST NOT break the LLM stream the
// CopilotKit runtime is piping back to the browser.

const { sendLogMessage } = require('../utils/utils');

function safeTotal(field) {
  if (!field || typeof field !== 'object') {return 0;}
  const value = field.total;

  return Number.isFinite(value) ? value : 0;
}

function formatLine({ modelId, step, prompt, completion, total }) {
  return `Agent step usage — model: ${modelId}, step: ${step}, prompt: ${prompt}, completion: ${completion}, total: ${total}`;
}

// `bot` is supplied by the runtime when the middleware is constructed so
// that tests can inject a mock notifier bot.
function createTokenUsageMiddleware({ bot }) {
  return {
    specificationVersion: 'v3',
    wrapStream: async ({ doStream, model }) => {
      const modelId = model && model.modelId ? model.modelId : 'unknown';
      let stepIndex = 0;
      const result = await doStream();

      const observer = new TransformStream({
        transform(chunk, controller) {
          if (chunk && chunk.type === 'finish') {
            stepIndex += 1;
            const prompt = safeTotal(chunk.usage && chunk.usage.inputTokens);
            const completion = safeTotal(
              chunk.usage && chunk.usage.outputTokens,
            );
            const total = prompt + completion;
            const line = formatLine({
              modelId,
              step: stepIndex,
              prompt,
              completion,
              total,
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
