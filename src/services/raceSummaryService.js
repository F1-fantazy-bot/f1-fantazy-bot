const { getAzureOpenAiClient } = require('../azureOpenAiClient');
const { buildRaceSummarySystemPrompt } = require('../prompts');

const RACE_SUMMARY_MODEL = 'gpt-6-astra';
// max_completion_tokens includes both reasoning and visible output tokens. A
// budget close to the requested prose length can therefore end before the
// model emits any visible text. Keep both attempts bounded while allowing one
// larger retry specifically for that exhaustion response.
const RACE_SUMMARY_MAX_COMPLETION_TOKENS = 8192;
const RACE_SUMMARY_RETRY_MAX_COMPLETION_TOKENS = 16384;
const RACE_SUMMARY_MAX_CHARACTERS = 3000;

function normalizeUsage(usage) {
  const prompt = Number(usage?.prompt_tokens) || 0;
  const completion = Number(usage?.completion_tokens) || 0;
  const suppliedTotal = Number(usage?.total_tokens);

  return {
    prompt,
    completion,
    total: Number.isFinite(suppliedTotal) ? suppliedTotal : prompt + completion,
  };
}

function formatRaceSummaryUsage(usage) {
  const normalized = normalizeUsage(usage);

  return `Race summary Azure OpenAI model - ${RACE_SUMMARY_MODEL}, tokens - prompt: ${normalized.prompt}, completion: ${normalized.completion}, total: ${normalized.total}`;
}

async function safelyReport(callback, value) {
  if (typeof callback !== 'function') {
    return;
  }

  try {
    await callback(value);
  } catch (error) {
    console.error('Race summary telemetry callback failed:', error);
  }
}

async function generateRaceSummary({
  summaryData,
  language,
  client = getAzureOpenAiClient(),
  onUsage,
  onError,
}) {
  try {
    const messages = [
      {
        role: 'system',
        content: buildRaceSummarySystemPrompt(language),
      },
      { role: 'user', content: JSON.stringify(summaryData) },
    ];
    const tokenBudgets = [
      RACE_SUMMARY_MAX_COMPLETION_TOKENS,
      RACE_SUMMARY_RETRY_MAX_COMPLETION_TOKENS,
    ];

    for (const [attempt, maxCompletionTokens] of tokenBudgets.entries()) {
      const completion = await client.chat.completions.create({
        model: RACE_SUMMARY_MODEL,
        max_completion_tokens: maxCompletionTokens,
        messages,
      });
      const usage = completion.usage;
      if (usage) {
        await safelyReport(onUsage, {
          model: RACE_SUMMARY_MODEL,
          usage: normalizeUsage(usage),
          message: formatRaceSummaryUsage(usage),
        });
      }

      const choice = completion.choices?.[0];
      const rawText = choice?.message?.content?.trim() || '';
      if (!rawText && choice?.finish_reason === 'length' && attempt === 0) {
        continue;
      }

      const text = rawText.slice(0, RACE_SUMMARY_MAX_CHARACTERS).trimEnd();

      return {
        text,
        usage,
        truncated: rawText.length > RACE_SUMMARY_MAX_CHARACTERS,
      };
    }
  } catch (error) {
    await safelyReport(onError, error);
    throw error;
  }
}

module.exports = {
  RACE_SUMMARY_MAX_CHARACTERS,
  RACE_SUMMARY_MAX_COMPLETION_TOKENS,
  RACE_SUMMARY_RETRY_MAX_COMPLETION_TOKENS,
  RACE_SUMMARY_MODEL,
  formatRaceSummaryUsage,
  generateRaceSummary,
  normalizeUsage,
};
