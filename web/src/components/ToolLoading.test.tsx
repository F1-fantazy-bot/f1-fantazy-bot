import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ToolLoading, type ToolLoadingKind } from './ToolLoading';
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

test('all loading states render Hebrew and RTL from the account context', () => {
  const kinds: ToolLoadingKind[] = [
    'nextRaces',
    'userTeams',
    'followedTeams',
    'leaderboard',
    'leagueChanges',
    'leagueGraph',
    'raceSummary',
    'whatsNew',
    'simulationStatus',
    'simulationRefresh',
    'resetUserData',
    'dataStatus',
    'bestTeams',
    'scenarios',
    'raceInfo',
    'weather',
    'deadline',
    'currentTeam',
    'liveScore',
    'liveLeaderboard',
    'guide',
    'write',
  ];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <UiLanguageProvider initialLanguage="he">
        {kinds.map((kind) => (
          <ToolLoading key={kind} kind={kind} />
        ))}
      </UiLanguageProvider>,
    );
  });

  const children = Array.from(container.children);
  expect(children).toHaveLength(kinds.length);
  expect(children.every((child) => child.getAttribute('dir') === 'rtl')).toBe(
    true,
  );
  expect(container.textContent).toContain('טוען מרוצים קרובים');
  expect(container.textContent).toContain('מחשב קבוצות מומלצות');
  expect(container.textContent).toContain('טוען שינויים בליגה');
  expect(container.textContent).toContain('טוען גרף ליגה');
  expect(container.textContent).toContain('מכין סיכום מרוץ');
  expect(container.textContent).toContain('טוען עדכונים');
  expect(container.textContent).toContain('טוען מצב סימולציה');
  expect(container.textContent).toContain('מרענן את הסימולציה העדכנית');
  expect(container.textContent).toContain('מאפס את הנתונים השמורים שלך');
  expect(container.textContent).toContain('בודק מצב נתונים');
  expect(container.textContent).toContain('מכין את עמדת הפיקוד');
  expect(container.textContent).toContain('מבצע את הפעולה');
  expect(container.textContent).not.toContain('Loading');

  act(() => root.unmount());
  container.remove();
});

test('provider follows an asynchronously resolved whoami language', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <UiLanguageProvider initialLanguage="en">
        <ToolLoading kind="bestTeams" />
      </UiLanguageProvider>,
    );
  });
  expect(container.textContent).toContain('Computing best teams');

  act(() => {
    root.render(
      <UiLanguageProvider initialLanguage="he">
        <ToolLoading kind="bestTeams" />
      </UiLanguageProvider>,
    );
  });
  expect(container.textContent).toContain('מחשב קבוצות מומלצות');
  expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');

  act(() => root.unmount());
  container.remove();
});
