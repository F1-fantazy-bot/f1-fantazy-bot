import { test, expect, type Page } from '@playwright/test';

function token(sub: string, lang: string, revision = 1) {
  return `test.${Buffer.from(JSON.stringify({ sub, lang, email: `${sub}@example.test`, name: 'Test Player', exp: Math.floor(Date.now() / 1000) + 3600, revision })).toString('base64url')}.synthetic`;
}
const api = '/api/agent/';
async function submit(page: Page, text: string) {
  await page.getByTestId('copilot-chat-textarea').fill(text);
  await page.getByTestId('copilot-chat-textarea').press('Enter');
}
async function finished(page: Page, he: boolean) {
  await expect(
    page
      .getByText(he ? 'הכרטיסים מוכנים.' : 'The cards are ready.', {
        exact: true,
      })
      .last(),
  ).toBeVisible();
}

test.beforeEach(async ({ page }, info) => {
  const lang = info.project.name.startsWith('he-') ? 'he' : 'en';
  const sub = `${info.testId}-${info.project.name}`;
  const jwt = token(sub, lang);
  await page.addInitScript(
    ({ jwt }) => {
      if (!sessionStorage.getItem('test-initialized')) {
        sessionStorage.setItem('f1-fantasy-agent-id-token', jwt);
        sessionStorage.setItem('test-initialized', 'yes');
      }
    },
    { jwt },
  );
  // Keep Google UI deterministic and ensure no real account/provider requests.
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('copilot-chat-textarea')).toBeVisible();
  (page as Page & { browserErrors: string[] }).browserErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { browserErrors: string[] }).browserErrors).toEqual(
    [],
  );
});

test('parallel cards join by call ID, stream independently, and recover once after reload', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  const unexpected: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().includes(api) &&
      !/\/(copilotkit|workflows|whoami)$/.test(request.url())
    )
      unexpected.push(request.url());
    if (request.url().endsWith('/copilotkit') && request.method() === 'POST') {
      const payload = request.postDataJSON();
      if (payload.method === 'agent/run')
        expect(payload.body.tools).toEqual([]); // Renderers never become frontend executors.
    }
  });
  await submit(page, 'parallel delayed');
  await expect(page.getByText(/Second result/)).toBeVisible();
  await expect(page.getByText(/First result/)).toHaveCount(0);
  await finished(page, he);
  const first = page.getByText(/First result/);
  const second = page.getByText(/Second result/);
  await expect(first).toHaveCount(1);
  await expect(second).toHaveCount(1);
  const order = await page.locator('.copilotKitMessages').innerText();
  expect(order.indexOf('First result')).toBeLessThan(
    order.indexOf('Second result'),
  );
  await expect(
    page.locator('.copilotKitMessage[data-text-direction="ltr"]').first(),
  ).toBeVisible();
  const input = page.getByTestId('copilot-chat-textarea');
  await input.fill('שלום');
  await expect(input).toHaveAttribute('dir', 'auto');
  await expect(input).toHaveAttribute('data-text-direction', 'rtl');
  await input.clear();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const table = page
    .getByRole('region', {
      name: he ? 'המרוצים הקרובים' : 'Upcoming Races',
      exact: true,
    })
    .first();
  await table.focus();
  await page.keyboard.press('ArrowRight');
  if (info.project.name.endsWith('mobile'))
    expect(
      await table.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
  await page.screenshot({
    path: info.outputPath('parallel-cards.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText(/First result/)).toHaveCount(1);
  await expect(page.getByText(/Second result/)).toHaveCount(1);
  await expect(page.locator('[data-read-card-id]')).toHaveCount(3);
  await submit(page, 'parallel delayed');
  await finished(page, he);
  await expect(page.getByText(/First result/)).toHaveCount(2);
  expect(unexpected).toEqual([]);
});

test('empty and failed results preserve other cards; cancellation and clear stop the run', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  await submit(page, 'partial empty');
  await finished(page, he);
  await expect(page.getByText('fixture-error', { exact: false })).toHaveCount(
    1,
  );
  await expect(page.getByText(/Second result/)).toHaveCount(1);
  await expect(
    page.getByText(he ? 'לא נמצאו מרוצים קרובים.' : 'No upcoming races found.'),
  ).toBeVisible();
  await submit(page, 'parallel delayed');
  await expect(page.getByTestId('copilot-send-button')).toBeVisible();
  // The native stop control shares the send button test ID during a run.
  await page.getByTestId('copilot-send-button').click();
  await page.getByRole('button', { name: 'Clear chat history' }).click();
  await expect(page.locator('[data-read-card-id]')).toHaveCount(0);
  await expect(page.getByText(/Second result/)).toHaveCount(0);
});

test('confirmation is explicit, duplicate clicks are suppressed, and reload never replays it', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  const decisions: unknown[] = [];
  const runs: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/write-decision'))
      decisions.push(request.postDataJSON());
    if (
      request.url().endsWith('/copilotkit') &&
      request.postDataJSON()?.method === 'agent/run'
    )
      runs.push(request.postDataJSON());
  });
  await submit(page, 'confirmation');
  await finished(page, he);
  await expect(
    page.getByText('Synthetic change requiring approval'),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Synthetic change requiring approval'),
  ).toBeVisible();
  expect(decisions).toHaveLength(0);
  expect(runs).toHaveLength(1);
  const approve = page.getByRole('button', {
    name: he ? 'כן, בצע' : 'Yes, do it',
    exact: true,
  });
  await approve.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByText('Synthetic change saved')).toBeVisible();
  expect(decisions).toHaveLength(1);
  expect(runs).toHaveLength(2);
  const hidden = JSON.stringify(runs[1]);
  expect(hidden).toContain('developer');
  expect(hidden).toContain('synthetic-nonce');
  await expect(page.locator('body')).not.toContainText('synthetic-nonce');
  await page.reload();
  await expect(page.getByText('Synthetic change saved')).toBeVisible();
  expect(runs).toHaveLength(2);
  expect(decisions).toHaveLength(1);
});

test('cancel and expired confirmations stay settled after reload', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  await submit(page, 'confirmation');
  await finished(page, he);
  await page
    .getByRole('button', { name: he ? 'ביטול' : 'Cancel', exact: true })
    .click();
  await expect(
    page.getByText(he ? 'בוטל' : 'Cancelled', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(he ? 'בוטל' : 'Cancelled', { exact: true }),
  ).toBeVisible();
  await submit(page, 'confirmation expired');
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page
    .getByRole('button', { name: he ? 'כן, בצע' : 'Yes, do it', exact: true })
    .last()
    .click();
  await expect(page.locator('[role="alert"]')).toBeVisible();
  await expect(page.getByText('Synthetic change saved')).toHaveCount(0);
});

test('workflows retain their turn, recover without auto-resume, and resume only on click', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  const advances: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/workflow-decision'))
      advances.push(request.postDataJSON());
  });
  await submit(page, 'workflow first');
  await finished(page, he);
  await submit(page, 'workflow second');
  await expect(
    page.getByRole('heading', { name: 'workflow second' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'workflow first' }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'workflow second' }),
  ).toHaveCount(1);
  expect(advances).toHaveLength(0);
  await page
    .getByRole('button', { name: he ? 'המשך' : 'Resume', exact: true })
    .first()
    .click();
  await expect(page.getByText(/Recovered calculation/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear chat history' }).click();
  await expect(
    page.getByRole('heading', { name: 'workflow second' }),
  ).toHaveCount(0);
});

test('real rich renderer catalogue remains visible and survives history recovery', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  await submit(page, 'catalogue');
  await finished(page, he);
  await expect(
    page.getByRole('button', { name: 'Kilzid', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('catalogue.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('[data-read-card-id]')).toHaveCount(51);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('token refresh, account change and sign-out keep headers and history scoped', async ({
  page,
}, info) => {
  const lang = info.project.name.startsWith('he-') ? 'he' : 'en';
  await submit(page, 'parallel');
  await finished(page, lang === 'he');
  const refreshed = token(`${info.testId}-${info.project.name}`, lang, 2);
  await page.evaluate(
    (jwt) => sessionStorage.setItem('f1-fantasy-agent-id-token', jwt),
    refreshed,
  );
  await page.reload();
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith('/copilotkit') &&
      request.postDataJSON()?.method === 'agent/run',
  );
  await submit(page, 'parallel');
  expect((await request).headers().authorization).toBe(`Bearer ${refreshed}`);
  await finished(page, lang === 'he');
  await page.evaluate(
    (jwt) => sessionStorage.setItem('f1-fantasy-agent-id-token', jwt),
    token(`other-${info.testId}`, lang),
  );
  await page.reload();
  await expect(page.getByText(/First result/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByTestId('copilot-chat-textarea')).toHaveCount(0);
});

test('choices and recommendation rows continue once with exact hidden arguments', async ({
  page,
}, info) => {
  const he = info.project.name.startsWith('he-');
  const runs: Array<{
    body: { messages: Array<{ role: string; content: string }> };
  }> = [];
  page.on('request', (request) => {
    if (
      request.url().endsWith('/copilotkit') &&
      request.postDataJSON()?.method === 'agent/run'
    )
      runs.push(request.postDataJSON());
  });
  await submit(page, 'choices');
  await finished(page, he);
  const choice = page.getByRole('button', { name: 'Kilzid', exact: true });
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('T1', { exact: true })).toBeVisible();
  expect(JSON.stringify(runs.at(-1))).toContain('get_current_team');
  expect(JSON.stringify(runs.at(-1))).toContain('T1');
  await submit(page, 'recommendation');
  const row = page.getByRole('button', {
    name: he ? 'הצג שינויים #1' : 'Show changes #1',
    exact: true,
  });
  await row.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(
    page.getByText(he ? 'אין צורך בשינויים.' : 'No changes needed.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(runs).toHaveLength(4);
  const last = runs.at(-1)!.body.messages.at(-1)!;
  expect(last.role).toBe('developer');
  expect(last.content).toContain('calculation-fixture');
  expect(last.content).toContain('"row":1');
});

test('a failed stream retains completed cards and an unauthorized run signs out', async ({
  page,
}) => {
  await submit(page, 'failed run');
  await expect(page.getByText(/Second result/)).toBeVisible();
  await expect(page.getByTestId('copilot-send-button')).toHaveAccessibleName(
    'Send message',
  );
  await page.reload();
  await expect(page.getByText(/Second result/)).toHaveCount(1);
  // A restored unfinished call is explanatory display data, never an executor.
  await expect(page.locator('[data-read-card-id]')).toHaveCount(3);
  await page.route('**/api/agent/copilotkit', async (route) => {
    if (route.request().postDataJSON()?.method === 'agent/run') {
      await route.fulfill({
        status: 401,
        json: { reason: 'session_expired' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } else await route.continue();
  });
  await submit(page, 'parallel');
  await expect(page.getByTestId('copilot-chat-textarea')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('f1-fantasy-agent-id-token'),
    ),
  ).toBeNull();
});
