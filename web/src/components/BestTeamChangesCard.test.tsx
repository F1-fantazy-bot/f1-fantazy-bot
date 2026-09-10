import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, test, vi } from 'vitest';
import { BestTeamChangesCard, RecommendationButton } from './BestTeamChangesCard';
const runAgent = vi.fn();
const agent = { messages: [] as any[], isRunning: false, addMessage: vi.fn(), setMessages: vi.fn(), subscribe: () => ({ unsubscribe() {} }) };
vi.mock('@copilotkit/react-core/v2', () => ({ UseAgentUpdate: { OnRunStatusChanged: 'status' }, useAgent: () => ({ agent }), useCopilotKit: () => ({ copilotkit: { runAgent } }) }));
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); agent.messages = [];
  agent.addMessage.mockImplementation((message) => agent.messages.push(message));
  agent.setMessages.mockImplementation((messages) => { agent.messages = messages; });
  runAgent.mockResolvedValue(undefined);
});
function render(element: React.ReactElement) {
  const container = document.createElement('div'); const root = createRoot(container);
  act(() => root.render(element));
  return { container, cleanup() { act(() => root.unmount()); } };
}
test('recommendation click preserves its calculation and row', async () => {
  const view = render(<RecommendationButton calculationId="older-table" row={2} />);
  await act(async () => view.container.querySelector('button')!.click());
  expect(agent.messages[0].content).toContain('"calculationId":"older-table","row":2');
  expect(agent.messages[0].content).toContain('get_best_team_changes');
  view.cleanup();
});
test('failed selection rolls back the injected message', async () => {
  runAgent.mockRejectedValueOnce(new Error('failed'));
  const view = render(<RecommendationButton calculationId="table" row={1} />);
  await act(async () => view.container.querySelector('button')!.click());
  expect(agent.messages).toEqual([]);
  expect(view.container.querySelector('[role="alert"]')).not.toBeNull(); view.cleanup();
});
test('outdated result recalculates original request without selecting a row', async () => {
  const view = render(<BestTeamChangesCard result={{ status: 'outdated_result', lang: 'he', request: { teamId: 'original', mustIncludeDrivers: ['VER'] } }} />);
  expect(view.container.textContent).toContain('חשב מחדש');
  await act(async () => view.container.querySelector('button')!.click());
  expect(agent.messages[0].content).toContain('"action":"get_best_teams"');
  expect(agent.messages[0].content).toContain('"teamId":"original"');
  expect(agent.messages[0].content).not.toContain('"row"'); view.cleanup();
});
test('invalid rows offer only available recommendations', () => {
  const view = render(<BestTeamChangesCard result={{ status: 'invalid_selection', calculationId: 'table', rows: [1, 2] }} />);
  expect([...view.container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Show changes #1', 'Show changes #2']); view.cleanup();
});
test('Hebrew transfer details isolate signed numbers and show individual projections', () => {
  const view = render(<BestTeamChangesCard result={{ status: 'ok', lang: 'he', row: 1, driversToRemove: ['VER'], driversToAdd: ['NOR'], deltaPoints: -2, drivers: [{ id: 'n', code: 'NOR', expectedPoints: 30 }] }} />);
  expect(view.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
  expect(view.container.textContent).toContain('הסר'); expect(view.container.textContent).toContain('30.00');
  expect([...view.container.querySelectorAll('bdi[dir="ltr"]')].some((item) => item.textContent === '-2.00')).toBe(true); view.cleanup();
});
