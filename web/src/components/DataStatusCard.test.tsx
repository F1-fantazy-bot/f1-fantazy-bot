import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { DataStatusCard, type DataStatusResult } from './DataStatusCard';

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

function renderCard(result?: DataStatusResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<DataStatusCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('DataStatusCard', () => {
  test('renders a complete safe data-readiness summary', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'en',
      source: 'personal_or_mixed',
      simulation: {
        status: 'ok',
        name: 'Monza simulation',
        matchday: 16,
        freshness: { status: 'fresh' },
      },
      projections: { drivers: 22, constructors: 11, available: true },
      teams: { ownedCount: 2, selected: 'Kilzid', hasSelectedTeam: true },
      missingPrerequisites: [],
      nextActions: [],
      cache: {
        projections: {
          drivers: [{ code: 'VER', price: 30.5, expectedPoints: 25, expectedPriceChange: 0.2 }],
          constructors: [{ code: 'MCL', price: 25, expectedPoints: 30, expectedPriceChange: -0.1 }],
        },
        teams: [{
          teamId: 'T1',
          teamName: 'Kilzid',
          isSelected: true,
          chip: 'LIMITLESS',
          drivers: ['VER', 'NOR'],
          constructors: ['MCL'],
          boost: 'VER',
          freeTransfers: 2,
          costCapRemaining: 0.5,
          budgetChangePointsPerMillion: 1.65,
        }],
      },
    });

    expect(rendered.container.querySelector('article')).not.toBeNull();
    expect(rendered.container.textContent).toContain('The required data is available');
    expect(rendered.container.textContent).toContain('Personal or mixed data');
    expect(rendered.container.textContent).toContain('Kilzid');
    expect(rendered.container.textContent).toContain('Cached data');
    expect(rendered.container.textContent).toContain('Saved rosters');
    expect(rendered.container.textContent).toContain('LIMITLESS');
    expect(rendered.container.textContent).toContain('VER, NOR');
    expect(rendered.container.textContent).toContain('Points-per-million ranking');
    expect(rendered.container.textContent).toContain('1.65');
    rendered.cleanup();
  });

  test('renders cached projection and roster data in Hebrew RTL', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'he',
      simulation: { status: 'ok', freshness: { status: 'fresh' } },
      projections: { available: true },
      teams: { ownedCount: 1, hasSelectedTeam: true },
      cache: {
        projections: {
          drivers: [{ code: 'VER', expectedPoints: 25 }],
          constructors: [{ code: 'MCL', expectedPoints: 30 }],
        },
        teams: [{
          teamId: 'T1',
          teamName: 'קילזי',
          isSelected: true,
          drivers: ['VER'],
          constructors: ['MCL'],
          chip: 'EXTRA_BOOST',
        }],
      },
    });

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(rendered.container.textContent).toContain('נתונים שמורים');
    expect(rendered.container.textContent).toContain('תחזית נהגים');
    expect(rendered.container.textContent).toContain('הרכבים שמורים');
    expect(rendered.container.textContent).toContain('EXTRA_BOOST');
    rendered.cleanup();
  });

  test('renders missing prerequisites and next steps in Hebrew RTL', () => {
    const rendered = renderCard({
      status: 'incomplete',
      lang: 'he',
      source: 'unavailable',
      simulation: { status: 'not_loaded', freshness: { status: 'unknown' } },
      projections: { drivers: 0, constructors: 0, available: false },
      teams: { ownedCount: 0, selected: null, hasSelectedTeam: false },
      missingPrerequisites: ['simulation', 'owned_team', 'selected_team'],
      nextActions: ['refresh_simulation', 'add_team', 'select_team'],
    });

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(rendered.container.textContent).toContain('חלק מהנתונים עדיין חסרים');
    expect(rendered.container.textContent).toContain('קבוצה שמורה');
    expect(rendered.container.textContent).toContain('נסה שוב לאחר רענון הסימולציה');
    expect(rendered.container.textContent).toContain('בחר קבוצה פעילה');
    rendered.cleanup();
  });

  test('renders an error state for failed payloads', () => {
    const rendered = renderCard({ status: 'error', lang: 'en' });
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('cannot be displayed');
    rendered.cleanup();
  });
});
