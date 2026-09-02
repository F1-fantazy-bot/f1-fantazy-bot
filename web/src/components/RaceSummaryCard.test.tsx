import { act } from 'react';
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
import { RaceSummaryCard, type RaceSummaryResult } from './RaceSummaryCard';

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

function renderCard(result: RaceSummaryResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<RaceSummaryCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('RaceSummaryCard', () => {
  test('renders a structured English recap accessibly', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'en',
      leagueName: 'Friends',
      raceName: 'Chinese Grand Prix',
      raceNumber: 2,
      summary:
        '🏁 Friends — Chinese Grand Prix — Race 2\n\n🏆 Winners and losers\nRocket won with 250 points.\n\n🔧 Team differences\nAlonso separated the rosters.\n\n📈 Season trends\nRocket climbed one place.\n\n🎭 Storylines\nWildcard timing made it interesting.',
    });

    expect(rendered.container.querySelector('article')).not.toBeNull();
    expect(rendered.container.querySelectorAll('section')).toHaveLength(4);
    expect(rendered.container.querySelector('h3')?.textContent).toContain('Friends');
    expect(rendered.container.textContent).toContain('Rocket won with 250 points');
    expect(rendered.container.textContent).toContain('Chinese Grand Prix · Race 2');
    rendered.cleanup();
  });

  test('renders Hebrew recap and truncation note in RTL', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'he',
      leagueName: 'ליגת חברים',
      raceName: 'גרנד פרי סין',
      raceNumber: 2,
      truncated: true,
      summary: '🏁 ליגת חברים — גרנד פרי סין — מרוץ 2\n\n🏆 מנצחים ומפסידים\nRocket ניצח.',
    });

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(rendered.container.textContent).toContain('מנצחים ומפסידים');
    expect(rendered.container.textContent).toContain('הסיכום קוצר');
    rendered.cleanup();
  });

  test.each([
    ['no_followed_leagues', 'No followed leagues'],
    ['not_followed', 'not in your followed leagues'],
    ['missing_data', 'not enough completed race data'],
    ['empty', 'generated summary was empty'],
    ['generation_error', 'cannot be generated'],
    ['error', 'cannot be displayed'],
  ] as const)('renders the %s state', (status, expected) => {
    const rendered = renderCard({ status, lang: 'en', leagueName: 'Test' });
    expect(rendered.container.textContent).toContain(expected);
    rendered.cleanup();
  });

  test('league card continues with the canonical code', async () => {
    const rendered = renderCard({
      status: 'select_league',
      lang: 'en',
      leagues: [{ leagueCode: 'ABC123', leagueName: 'Friendly League' }],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(addMessage.mock.calls[0][0].content).toContain('(ABC123)');
    expect(addMessage.mock.calls[0][0].content).toContain(
      'get_race_summary now with this exact canonical leagueCode',
    );
    expect(runAgent).toHaveBeenCalledWith({ agent });
    rendered.cleanup();
  });

  test('rolls back a failed clickable selection', async () => {
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
      'לא ניתן להתחיל',
    );
    rendered.cleanup();
  });

  test('ignores repeated clicks while the agent is running', async () => {
    agent.isRunning = true;
    const rendered = renderCard({
      status: 'select_league',
      lang: 'en',
      leagues: [{ leagueCode: 'ABC', leagueName: 'League' }],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    rendered.cleanup();
  });
});
