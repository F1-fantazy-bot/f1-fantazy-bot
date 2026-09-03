import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  AdminVersionCard,
  BillingStatsCard,
  BotUsersCard,
  BotfatherSetupCard,
  WebUsersCard,
} from './AdminReadCards';

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT;
});

function render(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test('renders localized admin version, billing, and BotFather cards without raw backend data', () => {
  const { container, cleanup } = render(
    <>
      <AdminVersionCard
        result={{
          status: 'ok',
          lang: 'en',
          version: {
            commitId: 'abc123',
            commitMessage: 'Safe deployment',
            commitLink: 'https://example.test/commit',
          },
        }}
      />
      <BillingStatsCard
        result={{
          status: 'ok',
          lang: 'en',
          billing: {
            currentMonth: {
              hasData: true,
              totalCost: 12.5,
              period: { monthName: 'September', year: 2026 },
              services: [
                { serviceName: 'Functions', cost: 12.5, currency: 'USD' },
              ],
            },
            previousMonth: { hasData: false },
            comparison: null,
          },
        }}
      />
      <BotfatherSetupCard
        result={{
          status: 'ok',
          lang: 'en',
          setup: {
            totalCount: 1,
            displayedCount: 1,
            commands: [{ command: 'help', description: 'Show help' }],
          },
        }}
      />
    </>,
  );

  expect(container.textContent).toContain('Deployment version');
  expect(container.textContent).toContain('abc123');
  expect(container.textContent).toContain('Azure billing');
  expect(container.textContent).toContain('Functions');
  expect(container.textContent).toContain('BotFather setup');
  expect(container.textContent).toContain('/help');
  expect(container.textContent).not.toContain(
    'AZURE_STORAGE_CONNECTION_STRING',
  );
  cleanup();
});

test('renders bot and web directories in Hebrew RTL with local timestamps and cap notices', () => {
  const { container, cleanup } = render(
    <>
      <BotUsersCard
        result={{
          status: 'ok',
          lang: 'he',
          directory: {
            totalCount: 101,
            displayedCount: 1,
            truncated: true,
            users: [
              {
                chatId: '7',
                nickname: 'פול',
                lang: 'he',
                firstSeen: '2026-09-01T08:00:00.000Z',
                lastSeen: '2026-09-02T08:00:00.000Z',
              },
            ],
          },
        }}
      />
      <WebUsersCard
        result={{
          status: 'ok',
          lang: 'he',
          directory: {
            totalCount: 1,
            displayedCount: 1,
            users: [
              {
                email: 'admin@example.com',
                chatId: '7',
                linkedDisplay: 'פול',
                addedAt: '2026-09-01T08:00:00.000Z',
                addedBy: '42',
              },
            ],
          },
        }}
      />
    </>,
  );

  expect(container.textContent).toContain('משתמשי הבוט');
  expect(container.textContent).toContain('משתמשי ווב מורשים');
  expect(container.textContent).toContain('מוצגות 1 מתוך 101');
  expect(container.textContent).toContain('יש תוצאות נוספות');
  expect(container.textContent).toContain('admin@example.com');
  expect(
    Array.from(container.querySelectorAll('article')).every(
      (card) => card.getAttribute('dir') === 'rtl',
    ),
  ).toBe(true);
  cleanup();
});

test('renders a safe localized forbidden state', () => {
  const { container, cleanup } = render(
    <AdminVersionCard
      result={{ status: 'forbidden', uiLang: 'he', summary: 'מנהלים בלבד.' }}
    />,
  );

  expect(container.textContent).toContain('מנהלים בלבד');
  expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
  expect(container.textContent).not.toContain('Commit ID');
  cleanup();
});
