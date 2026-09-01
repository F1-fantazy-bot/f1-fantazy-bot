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
import {
  LeagueChangesCard,
  type LeagueChangesResult,
} from './LeagueChangesCard';

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

function renderCard(result: LeagueChangesResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<LeagueChangesCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('LeagueChangesCard', () => {
  test('renders structured changes and unchanged team names accessibly', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'en',
      leagueName: 'Constructors League',
      matchdayId: 7,
      changedTeams: [
        {
          teamName: 'Fast Team',
          userName: 'owner',
          position: 1,
          isNew: false,
          hasChanges: true,
          drivers: { in: ['Leclerc'], out: ['Hamilton'] },
          constructors: { in: ['Ferrari'], out: ['Mercedes'] },
          captain: { from: 'Norris', to: 'Leclerc' },
          megaCaptain: { from: null, to: 'Leclerc' },
          chipsActivated: ['Wildcard'],
        },
      ],
      unchangedTeams: [
        {
          teamName: 'Steady Team',
          userName: 'steady',
          position: 2,
          isNew: false,
          hasChanges: false,
          drivers: { in: [], out: [] },
          constructors: { in: [], out: [] },
          captain: null,
          megaCaptain: null,
          chipsActivated: [],
        },
      ],
    });

    expect(rendered.container.querySelector('h3')?.textContent).toContain(
      'Constructors League',
    );
    expect(rendered.container.querySelector('[role="list"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Drivers out: Hamilton');
    expect(rendered.container.textContent).toContain('Drivers in: Leclerc');
    expect(rendered.container.textContent).toContain(
      'Constructors in: Ferrari',
    );
    expect(rendered.container.textContent).toContain(
      'Captain: Norris → Leclerc',
    );
    expect(rendered.container.textContent).toContain(
      'Mega captain: None → Leclerc',
    );
    expect(rendered.container.textContent).toContain(
      'Chip activated: Wildcard',
    );
    expect(rendered.container.textContent).toContain('Teams with no changes');
    expect(rendered.container.textContent).toContain('Steady Team');
    rendered.cleanup();
  });

  test('renders localized RTL new-team and no-change states', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'he',
      leagueName: 'ליגת בדיקה',
      matchdayId: 7,
      changedTeams: [
        {
          teamName: 'חדשה',
          userName: 'new',
          position: 1,
          isNew: true,
          hasChanges: true,
          drivers: { in: [], out: [] },
          constructors: { in: [], out: [] },
          captain: null,
          megaCaptain: null,
          chipsActivated: [],
        },
      ],
      unchangedTeams: [],
    });

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe(
      'rtl',
    );
    expect(rendered.container.textContent).toContain('שינויים בליגה');
    expect(rendered.container.textContent).toContain('קבוצה חדשה');
    rendered.cleanup();

    const empty = renderCard({
      status: 'ok',
      lang: 'he',
      leagueName: 'ליגה',
      matchdayId: 7,
      changedTeams: [],
      unchangedTeams: [],
    });
    expect(empty.container.textContent).toContain(
      'לא בוצעו שינויים באף קבוצה',
    );
    empty.cleanup();
  });

  test.each([
    ['missing_locked', 'No locked snapshot'],
    ['missing_planning', 'Weekly planning data'],
    ['matchday_mismatch', 'different matchdays'],
    ['no_followed_leagues', 'No followed leagues'],
    ['not_followed', 'not in your followed leagues'],
    ['error', 'cannot be displayed'],
  ] as const)('renders the %s state', (status, expected) => {
    const rendered = renderCard({
      status,
      lang: 'en',
      leagueName: 'Test',
      lockedMatchdayId: 6,
      planningMatchdayId: 7,
    });
    expect(rendered.container.textContent).toContain(expected);
    rendered.cleanup();
  });

  test('league card continues with the selected canonical leagueCode', async () => {
    const rendered = renderCard({
      status: 'select_league',
      lang: 'en',
      leagues: [{ leagueCode: 'ABC123', leagueName: 'Friendly League' }],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'developer',
        content: expect.stringContaining(
          'get_league_changes now with this exact canonical leagueCode',
        ),
      }),
    );
    expect(addMessage.mock.calls[0][0].content).toContain('(ABC123)');
    expect(runAgent).toHaveBeenCalledWith({ agent });
    expect(rendered.container.textContent).not.toContain('Loading changes');
    rendered.cleanup();
  });

  test('rolls back the selection message on a CopilotKit run failure', async () => {
    runAgent.mockImplementation(async () => {
      subscriber.onRunErrorEvent?.();

      return { newMessages: [] };
    });
    const rendered = renderCard({
      status: 'select_league',
      lang: 'he',
      leagues: [{ leagueCode: 'ABC123', leagueName: 'ליגה' }],
    });

    await act(async () => {
      rendered.container.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(agent.messages).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      'לא ניתן לטעון',
    );
    rendered.cleanup();
  });

  test('does not start a card selection while the agent is running', () => {
    agent.isRunning = true;
    const rendered = renderCard({
      status: 'select_league',
      lang: 'en',
      leagues: [{ leagueCode: 'ABC123', leagueName: 'League' }],
    });
    const button = rendered.container.querySelector<HTMLButtonElement>('button');

    expect(button?.getAttribute('aria-disabled')).toBe('true');
    act(() => button?.click());
    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    rendered.cleanup();
  });
});
