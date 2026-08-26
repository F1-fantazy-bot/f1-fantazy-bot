import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WriteResultCard } from './WriteResultCard';
import { TEAM_SELECTION_CHANGED_EVENT } from './UserTeamsList';

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

describe('WriteResultCard localization', () => {
  test('announces successful team selections to visible team lists', () => {
    const selectedTeamIds: string[] = [];
    const listener = (event: Event) => {
      selectedTeamIds.push((event as CustomEvent<string>).detail);
    };
    window.addEventListener(TEAM_SELECTION_CHANGED_EVENT, listener);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WriteResultCard
          result={{
            status: 'ok',
            tool: 'select_team',
            summary: 'Active team switched.',
            uiLang: 'en',
            teamId: 'T2',
          }}
        />,
      );
    });

    expect(selectedTeamIds).toEqual(['T2']);

    act(() => root.unmount());
    container.remove();
    window.removeEventListener(TEAM_SELECTION_CHANGED_EVENT, listener);
  });

  test('renders Hebrew result-shell labels when uiLang is he', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WriteResultCard
          result={{
            status: 'ok',
            tool: 'set_language',
            summary: 'השפה שונתה לעברית.',
            uiLang: 'he',
          }}
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.getAttribute('dir')).toBe(
      'rtl',
    );
    expect(container.textContent).toContain('בוצע');
    expect(container.textContent).toContain('פרטים');
    expect(container.textContent).toContain('השפה שונתה לעברית.');

    act(() => root.unmount());
    container.remove();
  });
});
