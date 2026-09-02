jest.mock('../azureOpenAiClient', () => ({
  getAzureOpenAiClient: jest.fn(),
}));

const { getAzureOpenAiClient } = require('../azureOpenAiClient');
const {
  RACE_SUMMARY_MAX_CHARACTERS,
  RACE_SUMMARY_MAX_COMPLETION_TOKENS,
  RACE_SUMMARY_MODEL,
  formatRaceSummaryUsage,
  generateRaceSummary,
} = require('./raceSummaryService');

const create = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  getAzureOpenAiClient.mockReturnValue({ chat: { completions: { create } } });
});

test('uses the shared model, saved-language prompt, token cap, and source data', async () => {
  create.mockResolvedValue({
    choices: [{ message: { content: '  🏁 סיכום  ' } }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
  });
  const onUsage = jest.fn();
  const summaryData = { leagueName: 'Friends', raceNumber: 2 };

  await expect(
    generateRaceSummary({ summaryData, language: 'he', onUsage }),
  ).resolves.toEqual({
    text: '🏁 סיכום',
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    truncated: false,
  });

  const request = create.mock.calls[0][0];
  expect(request).toMatchObject({
    model: RACE_SUMMARY_MODEL,
    max_completion_tokens: RACE_SUMMARY_MAX_COMPLETION_TOKENS,
  });
  expect(request.messages[0].content).toContain('entirely in Hebrew');
  expect(request.messages[1].content).toBe(JSON.stringify(summaryData));
  expect(onUsage).toHaveBeenCalledWith({
    model: RACE_SUMMARY_MODEL,
    usage: { prompt: 12, completion: 4, total: 16 },
    message: formatRaceSummaryUsage({
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16,
    }),
  });
});

test('hard-caps oversized model output', async () => {
  create.mockResolvedValue({
    choices: [{ message: { content: 'x'.repeat(RACE_SUMMARY_MAX_CHARACTERS + 50) } }],
  });

  const result = await generateRaceSummary({ summaryData: {}, language: 'en' });

  expect(result.text).toHaveLength(RACE_SUMMARY_MAX_CHARACTERS);
  expect(result.truncated).toBe(true);
});

test('returns an empty string for empty model output', async () => {
  create.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

  await expect(
    generateRaceSummary({ summaryData: {}, language: 'en' }),
  ).resolves.toMatchObject({ text: '', truncated: false });
});

test('reports generation errors without letting telemetry failures replace them', async () => {
  const generationError = new Error('private Azure detail');
  create.mockRejectedValue(generationError);
  const onError = jest.fn().mockRejectedValue(new Error('notifier down'));

  await expect(
    generateRaceSummary({ summaryData: {}, language: 'en', onError }),
  ).rejects.toThrow('private Azure detail');
  expect(onError).toHaveBeenCalledWith(generationError);
});
