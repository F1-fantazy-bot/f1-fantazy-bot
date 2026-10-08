import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { Message } from '@ag-ui/core';
import { clear, load, loadReadCards, save, saveReadCards, setHistoryScope, toAgUiMessages, toStoredMessages } from '../lib/chatHistoryStore';

const { testAgent, subscribers } = vi.hoisted(() => {
  const subscribers = new Set<{ onMessagesChanged: () => void }>();
  const testAgent = {
    messages: [] as Message[], isRunning: false,
    subscribe: (subscriber: { onMessagesChanged: () => void }) => {
      subscribers.add(subscriber);
      return { unsubscribe: () => subscribers.delete(subscriber) };
    },
    setMessages: (messages: Message[]) => {
      testAgent.messages = messages;
      subscribers.forEach((subscriber) => subscriber.onMessagesChanged());
    },
  };
  return { testAgent, subscribers };
});
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent: testAgent }),
  UseAgentUpdate: { OnMessagesChanged: 'messages', OnRunStatusChanged: 'running' },
}));
import { HistoryRestorer } from './HistoryRestorer';
import { ReadCardHistory, ReadCardHistoryProvider } from './ReadCardHistory';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });

const raceConversation: Message[] = [
  { id: 'prompt-1', role: 'user', content: 'מידע על המירוץ הבא' },
  { id: 'call-message', role: 'assistant', toolCalls: [
    { id: 'race-call', type: 'function', function: { name: 'get_next_race_info', arguments: '{}' } },
  ] },
  { id: 'result-message', role: 'tool', toolCallId: 'race-call', content: JSON.stringify({
    status: 'ok', lang: 'he', raceName: 'Singapore Grand Prix',
    circuitName: 'Marina Bay Street Circuit', location: { locality: 'Singapore', country: 'Singapore' },
    sessions: { race: '2026-10-11T12:00:00Z' },
  }) },
  { id: 'answer', role: 'assistant', content: 'המידע מוצג בכרטיס.' },
];
let root: ReturnType<typeof createRoot> | undefined;
function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<ReadCardHistoryProvider>
    <HistoryRestorer />
    <div data-prompt="first"><ReadCardHistory promptId="prompt-1" /></div>
    <div data-prompt="repeated"><ReadCardHistory promptId="prompt-2" /></div>
  </ReadCardHistoryProvider>));
  return container;
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  subscribers.clear();
  testAgent.messages = [];
  testAgent.isRunning = false;
  setHistoryScope(null);
  window.localStorage.clear();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

test('page refresh restores the Hebrew race card at its prompt without restoring any tool messages', async () => {
  save(toStoredMessages(raceConversation));
  saveReadCards(raceConversation);
  const container = mount();
  await act(async () => {});
  expect(container.querySelector('[data-prompt="first"]')!.textContent).toContain('Marina Bay Street Circuit');
  expect(container.querySelector('[data-prompt="repeated"]')!.textContent).toBe('');
  expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  expect(testAgent.messages).toEqual(toAgUiMessages(load()));
  expect(testAgent.messages.every((message) => message.role !== 'tool' && !('toolCalls' in message))).toBe(true);
  // CopilotKit's initial empty sync must not destroy either restored layer.
  act(() => testAgent.setMessages([]));
  expect(testAgent.messages).toHaveLength(2);
  expect(container.querySelectorAll('[data-read-card-id]')).toHaveLength(1);
});

test('captures live cards without duplicating them and flushes text before a quick refresh', async () => {
  vi.useFakeTimers();
  const container = mount();
  await act(async () => {});
  testAgent.isRunning = true;
  act(() => testAgent.setMessages(raceConversation));
  expect(loadReadCards()).toHaveLength(1);
  expect(container.querySelector('[data-read-card-id]')).toBeNull();
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(load()).toEqual(toStoredMessages(raceConversation));
  expect(loadReadCards()).toHaveLength(1);
  act(() => root!.unmount());
  root = undefined;
  testAgent.messages = [];
  testAgent.isRunning = false;
  const reloaded = mount();
  await act(async () => {});
  expect(reloaded.querySelectorAll('[data-read-card-id]')).toHaveLength(1);
});

test('clear removes recovered cards immediately and they stay absent after remount', async () => {
  save(toStoredMessages(raceConversation));
  saveReadCards(raceConversation);
  const container = mount();
  await act(async () => {});
  act(() => { clear(); testAgent.setMessages([]); });
  expect(container.querySelector('[data-read-card-id]')).toBeNull();
  expect(loadReadCards()).toEqual([]);
  act(() => root!.unmount());
  root = undefined;
  const reloaded = mount();
  expect(reloaded.querySelector('[data-read-card-id]')).toBeNull();
  expect(testAgent.messages).toEqual([]);
});

test.each(['list_followed_teams', 'list_user_teams'])('%s cards survive refresh under repeated Hebrew prompts without duplicates or tool context', async (tool) => {
  const result = {
    ...(tool === 'list_followed_teams' ? { status: 'ok' } : {}),
    lang: 'he',
    teams: [{
      teamId: 'tracked-team-1', teamName: 'Kilzid', isSelected: true,
      leagues: [{ leagueCode: 'league-1', leagueName: 'kilzi test', position: 5 }],
      isLeague: true, chip: null, drivers: ['VER'], constructors: ['FER'],
      boost: 'VER', freeTransfers: 2, costCapRemaining: 3,
    }],
  };
  const messages: Message[] = ['prompt-1', 'prompt-2'].flatMap((id) => [
    { id, role: 'user', content: 'מי הקבוצות שאני עוקב אחריהן' },
    { id: `${id}-call-message`, role: 'assistant', toolCalls: [
      { id: `${id}-call`, type: 'function', function: { name: tool, arguments: '{}' } },
    ] },
    { id: `${id}-result`, role: 'tool', toolCallId: `${id}-call`, content: JSON.stringify(result) },
    { id: `${id}-answer`, role: 'assistant', content: 'הקבוצות מוצגות בכרטיסים.' },
  ]);
  save(toStoredMessages(messages));
  saveReadCards(messages);
  const container = mount();
  await act(async () => {});
  for (const prompt of ['first', 'repeated']) {
    const turn = container.querySelector(`[data-prompt="${prompt}"]`)!;
    expect(turn.querySelectorAll('[data-read-card-id]')).toHaveLength(1);
    expect(turn.textContent).toContain('Kilzid');
    expect(turn.textContent).toContain('פעילה');
    expect(turn.querySelector('[dir="rtl"]')).not.toBeNull();
    expect(turn.querySelector('button:not([disabled])')).toBeNull();
    if (tool === 'list_followed_teams') {
      expect(turn.textContent).toContain('kilzi test');
      expect(turn.textContent).toContain('מ5');
    }
  }
  expect(testAgent.messages).toEqual(toAgUiMessages(load()));
  expect(testAgent.messages.every((message) => message.role !== 'tool' && !('toolCalls' in message))).toBe(true);
  act(() => testAgent.setMessages([]));
  expect(container.querySelectorAll('[data-read-card-id]')).toHaveLength(2);
  act(() => { clear(); testAgent.setMessages([]); });
  expect(container.querySelectorAll('[data-read-card-id]')).toHaveLength(0);
});
