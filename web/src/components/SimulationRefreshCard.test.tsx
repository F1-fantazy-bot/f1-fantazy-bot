import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { SimulationRefreshCard } from './SimulationRefreshCard';
import { UiLanguageProvider } from './uiLanguage';

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

function render(uiLang: 'en' | 'he') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const summary =
    uiLang === 'he'
      ? 'הסימולציה העדכנית רועננה מהמקור המשותף והעמיד: 22 נהגים ו־11 קבוצות · מחזור 14.'
      : 'Latest simulation refreshed from the shared durable source: 22 drivers and 11 constructors Matchday 14.';

  act(() => {
    root.render(
      <UiLanguageProvider initialLanguage={uiLang}>
        <SimulationRefreshCard
          result={{
            status: 'ok',
            tool: 'load_latest_simulation',
            uiLang,
            summary,
            source: {
              kind: 'durable_shared_source',
              label: 'F1 Fantasy simulation data',
            },
            fetchedAt:
              uiLang === 'he'
                ? '3 בספט׳ 2026, 11:16'
                : '3 Sept 2026, 11:16',
            matchday: 14,
            counts: { drivers: 22, constructors: 11 },
          }}
        />
      </UiLanguageProvider>,
    );
  });

  return { container, root };
}

test('renders safe refresh metadata rather than raw service data', () => {
  const { container, root } = render('en');

  expect(container.textContent).toContain('Simulation refreshed');
  expect(container.textContent).toContain('Shared durable simulation data');
  expect(container.textContent).toContain('3 Sept 2026, 11:16');
  expect(container.textContent).toContain('Matchday');
  expect(container.textContent).toContain('22');
  expect(container.textContent).toContain('This agent process refreshed its own cache');
  expect(container.textContent).not.toContain('durable_shared_source');
  expect(container.querySelector('article')?.getAttribute('dir')).toBe('ltr');

  act(() => root.unmount());
  container.remove();
});

test('renders Hebrew refresh metadata RTL in the saved language', () => {
  const { container, root } = render('he');

  expect(container.textContent).toContain('הסימולציה רועננה');
  expect(container.textContent).toContain('נתוני סימולציה משותפים ועמידים');
  expect(container.textContent).toContain('3 בספט׳ 2026, 11:16');
  expect(container.textContent).toContain('מחזור');
  expect(container.textContent).toContain('המטמון של תהליך הסוכן הזה רוענן');
  expect(container.querySelector('article')?.getAttribute('dir')).toBe('rtl');

  act(() => root.unmount());
  container.remove();
});
