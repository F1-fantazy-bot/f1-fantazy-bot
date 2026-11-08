const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('real runtime and Azure provider round-trip every parallel result and preserve dependent turns and identity', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, '__fixtures__/runtime-roundtrip.cjs')], {
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      COPILOTKIT_TELEMETRY_DISABLED: 'true',
      TELEGRAM_BOT_TOKEN: '',
      AZURE_OPENAI_ENDPOINT: 'https://synthetic.openai.azure.com',
      AZURE_OPENAI_API_KEY: 'synthetic-only',
      EXPECT_PARALLEL: 'true',
    },
  });
  expect(output).toContain('Runtime round trips passed');
}, 25000);
