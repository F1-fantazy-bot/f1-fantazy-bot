import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  LeagueGraphCard,
  type LeagueGraphResult,
} from './LeagueGraphCard';

const addMessage = vi.fn();
const setMessages = vi.fn();
const subscribe = vi.fn();
const unsubscribe = vi.fn();
const runAgent = vi.fn();
let subscriber: {
  onRunFailed?: () => void;
  onRunErrorEvent?: () => void;
} = {};
const agent = {
  addMessage,
  setMessages,
  subscribe,
  messages: [] as Array<{ id: string; role: string; content: string }>,
  isRunning: false,
};

vi.mock('@copilotkit/react-core/v2', () => ({
  UseAgentUpdate: { OnRunStatusChanged: 'run-status' },
  useAgent: () => ({ agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="responsive-chart">{children}</div>
  ),
  LineChart: ({ children }: { children?: ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: ({ name }: { name?: string }) => <span data-line={name} />,
  ReferenceDot: () => <span data-chip-marker="true" />,
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  agent.messages = [];
  agent.isRunning = false;
  subscriber = {};
  addMessage.mockImplementation((message) => {
    agent.messages = [...agent.messages, message];
  });
  setMessages.mockImplementation((messages) => {
    agent.messages = messages;
  });
  subscribe.mockImplementation((nextSubscriber) => {
    subscriber = nextSubscriber;

    return { unsubscribe };
  });
  runAgent.mockResolvedValue(undefined);
});

function point(
  matchdayId: number,
  label: string,
  value: number | null,
  chip: { name: string; emoji: string; label: string } | null = null,
) {
  return { matchdayId, label, value, chip };
}

function okResult(lang = 'en'): LeagueGraphResult {
  return {
    status: 'ok',
    lang,
    leagueCode: 'ABC',
    leagueName: lang === 'he' ? 'ליגת בדיקה' : 'Test League',
    graphType: 'gap',
    matchdays: [
      { key: 'matchday_1', matchdayId: 1, label: 'Bahrain GP' },
      { key: 'matchday_2', matchdayId: 2, label: 'Saudi GP' },
    ],
    series: [
      {
        teamId: 'owner_1',
        teamName: lang === 'he' ? 'הקבוצה שלי' : 'My Team',
        userName: 'owner',
        teamNo: 1,
        position: 1,
        color: '#e6194B',
        isSelected: true,
        points: [
          point(1, 'Bahrain GP', 0),
          point(2, 'Saudi GP', 0, {
            name: 'Wildcard',
            emoji: '🃏',
            label: '🃏 Wildcard',
          }),
        ],
      },
      {
        teamId: 'other_1',
        teamName: lang === 'he' ? 'יריבה' : 'Rival',
        userName: 'other',
        teamNo: 1,
        position: 2,
        color: '#3cb44b',
        isSelected: false,
        points: [point(1, 'Bahrain GP', -8), point(2, 'Saudi GP', -15)],
      },
    ],
  };
}

function renderCard(result: LeagueGraphResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<LeagueGraphCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('LeagueGraphCard', () => {
  test('renders an accessible chart, chip marker, controls, and data table', () => {
    const rendered = renderCard(okResult());

    expect(rendered.container.querySelector('h3')?.textContent).toContain(
      'Gap to leader: Test League',
    );
    expect(rendered.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'League history chart',
    );
    expect(rendered.container.textContent).toContain('My Team (Active team)');
    expect(rendered.container.textContent).toContain('🃏 Wildcard');
    expect(rendered.container.textContent).toContain('-15 pts');
    expect(rendered.container.querySelectorAll('[data-line]')).toHaveLength(2);
    expect(rendered.container.querySelectorAll('[data-chip-marker]')).toHaveLength(1);
    expect(rendered.container.querySelector('table')).not.toBeNull();
    rendered.cleanup();
  });

  test('lets the user hide and restore a chart series', () => {
    const rendered = renderCard(okResult());
    const checkboxes = rendered.container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    act(() => checkboxes[1].click());
    expect(rendered.container.querySelectorAll('[data-line]')).toHaveLength(1);
    act(() => checkboxes[1].click());
    expect(rendered.container.querySelectorAll('[data-line]')).toHaveLength(2);
    rendered.cleanup();
  });

  test('renders Hebrew result content in RTL', () => {
    const rendered = renderCard(okResult('he'));

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(rendered.container.textContent).toContain('פער מהמוביל');
    expect(rendered.container.textContent).toContain('הקבוצה הפעילה');
    expect(rendered.container.textContent).toContain('טבלת נתוני הגרף');
    rendered.cleanup();
  });

  test.each([
    ['no_followed_leagues', 'No followed leagues'],
    ['not_followed', 'not in your followed leagues'],
    ['not_found', 'not available yet'],
    ['no_data', 'not enough race data'],
    ['error', 'cannot be displayed'],
  ] as const)('renders the %s state', (status, expected) => {
    const rendered = renderCard({ status, lang: 'en', leagueName: 'Test' });
    expect(rendered.container.textContent).toContain(expected);
    rendered.cleanup();
  });

  test('league selection continues with canonical code and preserved type', async () => {
    const rendered = renderCard({
      status: 'select_league',
      lang: 'en',
      graphType: 'budget',
      leagues: [{ leagueCode: 'ABC', leagueName: 'Friendly League' }],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(addMessage.mock.calls[0][0].content).toContain('(ABC)');
    expect(addMessage.mock.calls[0][0].content).toContain('graphType="budget"');
    expect(runAgent).toHaveBeenCalledWith({ agent });
    expect(rendered.container.textContent).not.toContain('Loading graph');
    rendered.cleanup();
  });

  test('graph-type selection continues with exact league and type', async () => {
    const rendered = renderCard({
      status: 'select_graph_type',
      lang: 'en',
      leagueCode: 'ABC',
      leagueName: 'Friendly League',
      graphTypes: ['standings'],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(addMessage.mock.calls[0][0].content).toContain(
      'graphType="standings"',
    );
    expect(addMessage.mock.calls[0][0].content).toContain('(ABC)');
    expect(runAgent).toHaveBeenCalledWith({ agent });
    rendered.cleanup();
  });

  test('rolls back a failed card run and shows a localized error', async () => {
    runAgent.mockImplementation(async () => {
      subscriber.onRunErrorEvent?.();

      return { newMessages: [] };
    });
    const rendered = renderCard({
      status: 'select_league',
      lang: 'he',
      leagues: [{ leagueCode: 'ABC', leagueName: 'ליגה' }],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      'לא ניתן לטעון',
    );
    rendered.cleanup();
  });
});
