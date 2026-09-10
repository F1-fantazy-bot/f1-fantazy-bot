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
  expect(view.container.textContent).toContain('הסר'); expect(view.container.textContent).toContain('30.0');
  expect([...view.container.querySelectorAll('bdi[dir="ltr"]')].some((item) => item.textContent === '-2.0')).toBe(true); view.cleanup();
});

test('compact action keeps row only in accessible label', () => {
  const view = render(<RecommendationButton calculationId="c" row={3} />);
  const button = view.container.querySelector('button')!;
  expect(button.textContent).toBe('Show changes');
  expect(button.getAttribute('aria-label')).toBe('Show changes #3');
  view.cleanup();
});
test('no changes retains summary and collapsed disclosure without empty instructions', () => {
  const view = render(<BestTeamChangesCard result={{ status: 'ok', noChanges: true, projectedPoints: 90, captain: 'NOR', drivers: [{ id: 'NOR', code: 'NOR' }] }} />);
  expect(view.container.querySelector('details')?.open).toBe(false);
  expect(view.container.textContent).toContain('No changes needed.');
  expect(view.container.textContent).toContain('Captain');
  expect(view.container.querySelector('.transfer-plan__category')).toBeNull();
  expect(view.container.querySelector('.transfer-plan__assignments')).toBeNull();
  expect(view.container.querySelector('.transfer-plan__penalty')).toBeNull();
  view.cleanup();
});
test('captain-only, chip, penalty and complete currency expressions', () => {
  const view = render(<BestTeamChangesCard result={{ status: 'ok', newBoost: 'NOR', extraBoostDriver: 'VER', chipToActivate: 'EXTRA_BOOST', penalty: 10, expectedPriceChange: -0.23 }} />);
  expect(view.container.querySelector('.transfer-plan__category')).toBeNull();
  expect(view.container.textContent).toContain('Set captain');
  expect(view.container.textContent).toContain('Activate chip');
  expect(view.container.querySelector('.transfer-plan__penalty')?.textContent).toBe('Penalty: 10');
  expect([...view.container.querySelectorAll('bdi')].some((el) => el.textContent === '-0.23 M' && el.dir === 'ltr')).toBe(true);
  view.cleanup();
});
test('ambiguous and older code-only transfers never guess images; failed images fall back', () => {
  const view = render(<BestTeamChangesCard result={{ status: 'ok', driversToRemove: ['NOR'], incomingDrivers: [{ id: 'old', code: 'VER', ambiguousCode: true }], drivers: [{ id: 'NOR', code: 'NOR' }, { id: 'x', code: 'VER', name: 'Max Verstappen', ambiguousCode: true }] }} />);
  expect(view.container.querySelector('.transfer-plan__category img')).toBeNull();
  const img = view.container.querySelector('img')!;
  expect(img).not.toBeNull();
  act(() => img.dispatchEvent(new Event('error')));
  expect(view.container.querySelectorAll('img')).toHaveLength(1);
  expect(view.container.querySelector('.transfer-plan__roster .transfer-player__image')?.textContent).toBe('NOR');
  view.cleanup();
});
test('constructor-only transfers omit drivers and captain badges use IDs', () => {
  const view = render(<BestTeamChangesCard result={{ status: 'ok', outgoingConstructors: [{ id: 'FER', code: 'FER' }], incomingConstructors: [{ id: 'MCL', code: 'MCL' }], captainPlayer: { id: 'new', code: 'VER' }, drivers: [{ id: 'old', code: 'VER' }, { id: 'new', code: 'VER' }] }} />);
  expect([...view.container.querySelectorAll('.transfer-plan__category h4')].map((el) => el.textContent)).toEqual(['Constructors']);
  const players = view.container.querySelectorAll('.transfer-plan__roster .transfer-player');
  expect(players[0].textContent).not.toContain('Captain');
  expect(players[1].textContent).toContain('Captain');
  expect(view.container.querySelectorAll('.transfer-plan__roster img')).toHaveLength(0);
  view.cleanup();
});
test('recommendation controls share the run lock while a selection is pending', async () => {
  let finish!: () => void;
  runAgent.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = render(<><RecommendationButton calculationId="c" row={1} /><RecommendationButton calculationId="c" row={2} /></>);
  const buttons = view.container.querySelectorAll('button');
  await act(async () => buttons[0].click());
  await act(async () => buttons[1].click());
  expect(runAgent).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  view.cleanup();
});
