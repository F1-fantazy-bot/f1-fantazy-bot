import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
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

  test('explains the supported count in Hebrew', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<BestTeamsTable result={{ lang: 'he', status: 'invalid_result_count' }} />));
    expect(container.textContent).toContain('בין 1 ל-20');
    act(() => root.unmount());
    container.remove();
  });
});
const runAgent = vi.fn().mockResolvedValue(undefined);
const selectionAgent = {
  messages: [] as { content: string }[], isRunning: false,
  addMessage(message: { content: string }) { this.messages.push(message); },
  setMessages(messages: { content: string }[]) { this.messages = messages; },
  subscribe: () => ({ unsubscribe() {} }),
};
vi.mock('@copilotkit/react-core/v2', () => ({
  UseAgentUpdate: { OnRunStatusChanged: 'status' },
  useAgent: () => ({ agent: selectionAgent }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
}));

type OkResult = Extract<NonNullable<React.ComponentProps<typeof BestTeamsTable>['result']>, { status: 'ok' }>;
const sampleResult = (): OkResult => ({
  status: 'ok', calculationId: 'calculation-original', lang: 'en',
  teamId: 'team', teamName: 'Test team', chip: null, rankBy: 'points',
  budgetChangePointsPerMillion: 1,
  filters: { mustIncludeDrivers: [], mustExcludeDrivers: [], mustIncludeConstructors: [], mustExcludeConstructors: [] },
  bestTeams: [3, 1, 2].map((row, index) => ({
    row, drivers: [['NOR'], ['VER'], ['LEC']][index], constructors: ['MCL'],
    boostDriver: 'NOR', extraBoostDriver: null, penalty: 0,
    totalPrice: [99.94, 100.01, 99.96][index],
    projectedPoints: [8, 100, 20][index],
    budgetAdjustedPoints: [120, 70, 90][index],
    transfersNeeded: [0, 2, 1][index],
    expectedPriceChange: [-0.001, -0.002, 0][index],
  })),
});

function tableView(result = sampleResult()) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (next?: React.ComponentProps<typeof BestTeamsTable>['result']) =>
    act(() => root.render(<BestTeamsTable result={next} />));
  render(result);
  return {
    container, render,
    rows: () => [...container.querySelectorAll('tbody .best-teams__recommendation > strong')].map(el => el.textContent),
    header: (name: string) => [...container.querySelectorAll<HTMLButtonElement>('thead button')]
      .find(button => button.getAttribute('aria-label')?.startsWith('Sort by ' + name + ','))!,
    cleanup() { act(() => root.unmount()); container.remove(); },
  };
}

describe('BestTeamsTable sorting', () => {
  test.each([
    ['Recommendation number', ['#3', '#2', '#1'], ['#1', '#2', '#3']],
    ['Price', ['#1', '#2', '#3'], ['#3', '#2', '#1']],
    ['Points', ['#1', '#2', '#3'], ['#3', '#2', '#1']],
    ['budget-adjusted points', ['#3', '#2', '#1'], ['#1', '#2', '#3']],
    ['Transfers', ['#1', '#2', '#3'], ['#3', '#2', '#1']],
    ['Price change', ['#2', '#3', '#1'], ['#1', '#3', '#2']],
  ])('sorts %s by raw numbers in both directions', (name, descending, ascending) => {
    const result = sampleResult();
    // Selection is tested separately using the real control.
    delete result.calculationId;
    const original = JSON.stringify(result);
    const view = tableView(result);
    expect(view.rows()).toEqual(['#3', '#1', '#2']);
    expect(view.container.querySelector('[aria-sort]')).toBeNull();
    const button = view.header(name);
    expect(button.type).toBe('button');
    act(() => button.click());
    expect(view.rows()).toEqual(descending);
    expect(button.parentElement?.getAttribute('aria-sort')).toBe('descending');
    expect(button.textContent).toContain('↓');
    expect(button.getAttribute('aria-label')).toContain('ascending');
    act(() => button.click());
    expect(view.rows()).toEqual(ascending);
    expect(button.parentElement?.getAttribute('aria-sort')).toBe('ascending');
    expect(button.textContent).toContain('↑');
    expect(JSON.stringify(result)).toBe(original);
    view.cleanup();
  });

  test('switching columns starts descending even when previously sorted ascending', () => {
    const result = sampleResult(); delete result.calculationId;
    const view = tableView(result);
    act(() => view.header('Points').click());
    act(() => view.header('Points').click());
    act(() => view.header('Price').click());
    expect(view.rows()).toEqual(['#1', '#2', '#3']);
    expect(view.container.querySelectorAll('[aria-sort]')).toHaveLength(1);
    act(() => view.header('Points').click());
    expect(view.rows()).toEqual(['#1', '#2', '#3']);
    expect(view.header('Points').parentElement?.getAttribute('aria-sort')).toBe('descending');
    view.cleanup();
  });

  test.each(['budgetAdjustedPoints', 'expectedPriceChange'] as const)(
    '%s keeps missing values last and ties in original order in both directions', field => {
      const result = sampleResult(); delete result.calculationId;
      const template = result.bestTeams[0];
      result.bestTeams = [null, 10, undefined, -2, 10, Number.NaN].map((value, index) => ({
        ...template, row: index + 1, [field]: value,
      }));
      const view = tableView(result);
      const name = field === 'budgetAdjustedPoints' ? 'budget-adjusted points' : 'Price change';
      act(() => view.header(name).click());
      expect(view.rows()).toEqual(['#2', '#5', '#4', '#1', '#3', '#6']);
      act(() => view.header(name).click());
      expect(view.rows()).toEqual(['#4', '#2', '#5', '#1', '#3', '#6']);
      view.cleanup();
    },
  );

  test('resets for new calculations and safely renders loading, error, and empty states', () => {
    const result = sampleResult(); delete result.calculationId;
    const view = tableView(result);
    act(() => view.header('Price').click());
    view.render(JSON.parse(JSON.stringify(result)));
    expect(view.rows()).toEqual(['#1', '#2', '#3']);
    view.render({ ...result, calculationId: 'new-calculation' });
    expect(view.rows()).toEqual(['#3', '#1', '#2']);
    act(() => view.header('Price').click());
    view.render({ ...result, calculationId: 'another-calculation' });
    expect(view.rows()).toEqual(['#3', '#1', '#2']);
    expect(view.container.querySelector('[aria-sort]')).toBeNull();
    view.render(undefined);
    view.render({ status: 'missing_cache' });
    view.render({ ...result, bestTeams: [] });
    view.render(result);
    expect(view.rows()).toEqual(['#3', '#1', '#2']);
    view.cleanup();
  });

  test('budget-adjusted sorting is only offered when its column is visible', () => {
    const result = sampleResult(); delete result.calculationId;
    const view = tableView({ ...result, budgetChangePointsPerMillion: 0 });
    expect(view.container.querySelectorAll('thead button')).toHaveLength(5);
    expect(view.header('budget-adjusted points')).toBeUndefined();
    view.cleanup();
  });

  test('Hebrew sort controls are localized, RTL, and include the next direction', () => {
    const result = sampleResult(); delete result.calculationId;
    const view = tableView({ ...result, lang: 'he' });
    expect(view.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    const buttons = [...view.container.querySelectorAll<HTMLButtonElement>('thead button')];
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
      'מיון לפי מספר המלצה, בסדר יורד', 'מיון לפי מחיר, בסדר יורד',
      'מיון לפי נקודות, בסדר יורד', 'מיון לפי נקודות מותאמות תקציב, בסדר יורד',
      'מיון לפי העברות, בסדר יורד', 'מיון לפי שינוי מחיר, בסדר יורד',
    ]);
    act(() => buttons[1].click());
    expect(buttons[1].getAttribute('aria-label')).toBe('מיון לפי מחיר, בסדר עולה');
    view.cleanup();
  });

  test('selection after sorting sends the original calculation ID and team row', async () => {
    const view = tableView();
    act(() => view.header('Price').click());
    const firstRow = view.container.querySelector('tbody tr')!;
    expect(firstRow.querySelector('strong')?.textContent).toBe('#1');
    expect(firstRow.textContent).toContain('VER');
    await act(async () => firstRow.querySelector<HTMLButtonElement>('button')!.click());
    expect(selectionAgent.messages[selectionAgent.messages.length - 1]?.content).toContain('"calculationId":"calculation-original","row":1');
    expect(runAgent).toHaveBeenCalledTimes(1);
    view.cleanup();
  });
});
