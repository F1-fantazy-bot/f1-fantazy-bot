import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BestTeamsTable } from './BestTeamsTable';

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

describe('BestTeamsTable localization', () => {
  test('renders Hebrew labels and RTL while preserving F1 codes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BestTeamsTable
          result={{
            status: 'ok',
            lang: 'he',
            teamId: 'Dorse_1',
            teamName: 'dorsegal3',
            chip: null,
            rankBy: 'budget_adjusted',
            budgetChangePointsPerMillion: 1.65,
            filters: {
              mustIncludeDrivers: ['NOR'],
              mustExcludeDrivers: [],
              mustIncludeConstructors: [],
              mustExcludeConstructors: [],
            },
            bestTeams: [
              {
                row: 1,
                drivers: ['NOR', 'LEC', 'HUL', 'BOR', 'STR'],
                constructors: ['MCL', 'FER'],
                boostDriver: 'NOR',
                extraBoostDriver: null,
                totalPrice: 123.4,
                transfersNeeded: 2,
                penalty: 0,
                projectedPoints: 272.9,
                budgetAdjustedPoints: 302.4,
                expectedPriceChange: 1.79,
              },
            ],
          }}
        />,
      );
    });

    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(container.textContent).toContain('הקבוצות הטובות ביותר');
    expect(container.textContent).toContain('מדורג לפי');
    expect(container.textContent).toContain('נקודות מותאמות תקציב');
    expect(container.textContent).toContain('נהגים');
    expect(container.textContent).toContain('קבוצות');
    expect(container.textContent).toContain('מחיר');
    expect(container.textContent).toContain('העברות');
    expect(container.textContent).toContain("ללא צ'יפ");
    expect(container.textContent).toContain('NOR');
    expect(container.textContent).toContain('MCL');
    expect(container.textContent).not.toContain('Best teams');
    expect(container.textContent).not.toContain('Ranked by');

    act(() => root.unmount());
    container.remove();
  });

  test('renders localized preparation failures instead of raw status codes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BestTeamsTable
          result={{ lang: 'he', status: 'projection_mismatch' }}
        />,
      );
    });

    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(container.textContent).toContain('נתוני התחזית אינם תואמים');
    expect(container.textContent).not.toContain('projection_mismatch');

    act(() => root.unmount());
    container.remove();
  });
});
