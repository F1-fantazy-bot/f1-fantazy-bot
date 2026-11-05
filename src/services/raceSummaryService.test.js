jest.mock('../azureOpenAiClient', () => ({
  getAzureOpenAiClient: jest.fn(),
}));

const { getAzureOpenAiClient } = require('../azureOpenAiClient');
const {
  RACE_SUMMARY_MAX_CHARACTERS,
  RACE_SUMMARY_MAX_COMPLETION_TOKENS,
  RACE_SUMMARY_RETRY_MAX_COMPLETION_TOKENS,
  RACE_SUMMARY_MODEL,
  formatRaceSummaryUsage,
  generateRaceSummary,
} = require('./raceSummaryService');

const create = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  getAzureOpenAiClient.mockReturnValue({ chat: { completions: { create } } });
});

test.each([
  [3, 3],
  [0, 0],
  [undefined, 'n/a'],
  [null, 'n/a'],
  [Number.NaN, 'n/a'],
  [Infinity, 'n/a'],
])(
  'uses Astra and reports reasoning tokens without changing totals (%s)',
  async (reasoningTokens, expectedReasoning) => {
    create.mockResolvedValue({
      choices: [{ message: { content: '  🏁 סיכום  ' } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
        completion_tokens_details: { reasoning_tokens: reasoningTokens },
      },
    });
    const onUsage = jest.fn();
    const summaryData = { leagueName: 'Friends', raceNumber: 2 };

    await expect(
      generateRaceSummary({ summaryData, language: 'he', onUsage }),
    ).resolves.toEqual({
      text: '🏁 סיכום',
      usage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
        completion_tokens_details: { reasoning_tokens: reasoningTokens },
      },
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
      usage: {
        prompt: 12,
        completion: 4,
        reasoning: expectedReasoning,
        total: 16,
      },
      message: formatRaceSummaryUsage({
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
        completion_tokens_details: { reasoning_tokens: reasoningTokens },
      }),
    });
    expect(onUsage.mock.calls[0][0].message).toContain(
      `reasoning: ${expectedReasoning}, total: 16`,
    );
  },
);

test('hard-caps oversized model output', async () => {
  create.mockResolvedValue({
    choices: [
      { message: { content: 'x'.repeat(RACE_SUMMARY_MAX_CHARACTERS + 50) } },
    ],
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

test('retries once with a bounded larger budget when reasoning exhausts the first budget', async () => {
  create
    .mockResolvedValueOnce({
      choices: [{ finish_reason: 'length', message: { content: '' } }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8192,
        total_tokens: 8212,
        completion_tokens_details: { reasoning_tokens: 8192 },
      },
    })
    .mockResolvedValueOnce({
      choices: [
        { finish_reason: 'stop', message: { content: 'Recovered recap' } },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 900,
        completion_tokens_details: { reasoning_tokens: 600 },
      },
    });
  const onUsage = jest.fn();

  await expect(
    generateRaceSummary({ summaryData: {}, language: 'en', onUsage }),
  ).resolves.toMatchObject({ text: 'Recovered recap', truncated: false });

  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0][0].max_completion_tokens).toBe(
    RACE_SUMMARY_MAX_COMPLETION_TOKENS,
  );
  expect(create.mock.calls[1][0].max_completion_tokens).toBe(
    RACE_SUMMARY_RETRY_MAX_COMPLETION_TOKENS,
  );
  expect(onUsage).toHaveBeenCalledTimes(2);
  expect(onUsage.mock.calls.map(([report]) => report.usage)).toEqual([
    { prompt: 20, completion: 8192, reasoning: 8192, total: 8212 },
    { prompt: 20, completion: 900, reasoning: 600, total: 920 },
  ]);
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
