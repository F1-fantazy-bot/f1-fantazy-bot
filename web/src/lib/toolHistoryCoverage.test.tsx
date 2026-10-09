import { createRequire } from 'node:module';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, afterAll, expect, test, vi } from 'vitest';
import type { Message } from '@ag-ui/core';
import policies from './toolHistoryPolicy.json';
import fixtureData from './__fixtures__/toolHistoryResults.json';
import { clear, loadReadCards, saveReadCards, saveCardDecision, saveDirectCard, toAgUiMessages, toStoredMessages } from './chatHistoryStore';
import { RecoveredToolCard } from '../components/RecoveredToolCard';
import { workflowRenderers } from '../components/workflowRenderers';
import { WriteDecisionProvider } from '../components/WriteDecisionContext';
import { UiLanguageProvider } from '../components/uiLanguage';

const { agent, runAgent } = vi.hoisted(() => ({
  agent: { messages: [] as Message[], isRunning: false, subscribe: () => ({ unsubscribe() {} }), addMessage: vi.fn(), setMessages: vi.fn() },
  runAgent: vi.fn(),
}));
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent }), useCopilotKit: () => ({ copilotkit: { runAgent } }),
  UseAgentUpdate: { OnMessagesChanged: 'messages', OnRunStatusChanged: 'running' },
}));
const fixtures: Record<string, Record<string, unknown>> = fixtureData;
const require = createRequire(import.meta.url);
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  window.localStorage.clear(); document.body.innerHTML = ''; agent.messages = [];
  vi.restoreAllMocks(); runAgent.mockClear();
});
function conversation(tool: string, result: unknown, args: Record<string, unknown> = {}): Message[] {
  return [
    { id: 'prompt', role: 'user', content: 'בדיקת הכרטיס' },
    { id: 'call-message', role: 'assistant', toolCalls: [{ id: 'call', type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] },
    { id: 'tool-result', role: 'tool', toolCallId: 'call', content: JSON.stringify(result) },
    { id: 'answer', role: 'assistant', content: 'התוצאה מוצגת בכרטיס.' },
  ];
}
function renderCard(card = loadReadCards()[0]) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  act(() => root.render(<UiLanguageProvider initialLanguage="en"><WriteDecisionProvider runtimeUrl="http://localhost/api/agent/copilotkit">
    <RecoveredToolCard card={card} />
  </WriteDecisionProvider></UiLanguageProvider>));
  return container;
}

test('every backend tool has an explicit refresh policy, fixture and read renderer', () => {
  const names: string[] = require('../../../src/agent/tools.js').tools.map((tool: { name: string }) => tool.name);
  expect(Object.keys(policies).sort()).toEqual(names.sort());
  expect(Object.keys(fixtures).sort()).toEqual(names.sort());
  expect(Object.keys(workflowRenderers).sort()).toEqual(Object.entries(policies).filter(([, policy]) => policy === 'read').map(([name]) => name).sort());
});

test.each(Object.entries(policies).filter(([, policy]) => policy !== 'workflow'))('%s survives text-only refresh and renders without executing a tool', (tool) => {
  const messages = conversation(tool, fixtures[tool]);
  saveReadCards(messages);
  agent.messages = toAgUiMessages(toStoredMessages(messages));
  saveReadCards(agent.messages);
  expect(loadReadCards()).toHaveLength(1);
  expect(loadReadCards()[0].result).toEqual(fixtures[tool]);
  const fetch = vi.spyOn(window, 'fetch');
  const container = renderCard();
  expect(container.textContent?.trim().length).toBeGreaterThan(0);
  expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  expect(runAgent).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(agent.messages.every((message) => message.role !== 'tool' && !('toolCalls' in message))).toBe(true);
});

test.each(Object.entries(policies))('%s preserves a friendly tool error after refresh', (tool) => {
  const result = { status: 'tool_error', tool, uiLang: 'he', errorId: 'safe-id', userMessage: 'Please try again.' };
  saveReadCards(conversation(tool, result));
  expect(loadReadCards()).toHaveLength(1);
  expect(renderCard().querySelector('[role="alert"]')?.textContent).toContain('safe-id');
});

test.each([
  ['get_next_races', { lang: 'he', races: [], counts: { total: 0, sprint: 0 } }],
  ['get_next_race_info', { lang: 'he', status: 'unavailable' }],
  ['get_race_weather', { lang: 'he', status: 'unavailable' }],
  ['get_deadline', { lang: 'he', status: 'unavailable' }],
  ['get_current_team', { lang: 'he', status: 'no_teams' }],
  ['get_best_teams', { lang: 'he', status: 'projection_mismatch' }],
  ['get_best_team_scenarios', { lang: 'he', status: 'missing_weekend_format' }],
  ['get_simulation_status', { lang: 'he', status: 'not_loaded' }],
  ['get_whats_new', { lang: 'he', status: 'empty' }],
  ['get_data_status', fixtures.get_data_status],
  ['list_followed_teams', { lang: 'he', status: 'empty' }],
  ['list_user_teams', { lang: 'he', teams: [] }],
  ['list_user_leagues', { lang: 'he', leagues: [] }],
  ['list_league_teams', { lang: 'he', status: 'ok', teams: [] }],
] as Array<[string, Record<string, unknown>]>)('%s also retains its empty, unavailable or prerequisite card', (tool, result) => {
  saveReadCards(conversation(tool, result));
  expect(loadReadCards()).toHaveLength(1);
  expect(renderCard().textContent?.trim().length).toBeGreaterThan(0);
});

test.each(Object.entries(policies).filter(([tool, policy]) => policy === 'write' && tool !== 'confirm_write'))('%s confirmation and settled decision persist without automatic approval', (tool) => {
  const result = { status: 'confirmation_required', tool, writeNonce: 'nonce', summary: 'Review this change.', uiLang: 'he' };
  saveReadCards(conversation(tool, result));
  const fetch = vi.spyOn(window, 'fetch');
  expect(renderCard().querySelector('[role="dialog"]')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(runAgent).not.toHaveBeenCalled();
  saveCardDecision('nonce', 'cancelled');
  const cancelled = renderCard();
  expect(cancelled.textContent).toContain('בוטל');
  expect(cancelled.querySelector('button:not([disabled])')).toBeNull();
});

test('pending requests survive as interrupted cards; completed workflows use durable recovery', () => {
  saveReadCards(conversation('get_next_race_info', {}).slice(0, 2));
  expect(loadReadCards()[0].interrupted).toBe(true);
  expect(renderCard().textContent).toContain('interrupted');
  clear();
  for (const tool of ['propose_workflow', 'get_workflow_status']) {
    saveReadCards(conversation(tool, fixtures[tool]).slice(0, 2));
    expect(loadReadCards()[0].interrupted).toBe(true);
    saveReadCards(conversation(tool, fixtures[tool]));
    expect(loadReadCards()).toEqual([]);
  }
});

test('the missing-league report action survives refresh without automatically filing a report', () => {
  saveReadCards(conversation('follow_league', {
    status: 'not_found', tool: 'follow_league', uiLang: 'en', summary: 'League missing.',
    reportAction: { type: 'report_missing_league', leagueCode: 'MISSING', message: 'Please investigate MISSING.' },
  }));
  const fetch = vi.spyOn(window, 'fetch');
  expect(renderCard().querySelector('button')?.textContent).toContain('Report missing league');
  expect(fetch).not.toHaveBeenCalled();
  expect(runAgent).not.toHaveBeenCalled();
});

test('direct proposals and final receipts survive reload without applying historical selected-team changes', () => {
  const messages = conversation('list_user_teams', fixtures.list_user_teams);
  saveReadCards(messages);
  saveDirectCard(messages, 'select_team', { teamId: 'T2' }, {
    status: 'confirmation_required', tool: 'select_team', writeNonce: 'direct-nonce', summary: 'Change active team.', uiLang: 'he',
  });
  expect(loadReadCards()).toHaveLength(2);
  saveCardDecision('direct-nonce', 'confirmed', { status: 'ok', tool: 'select_team', teamId: 'T2', uiLang: 'he', summary: 'Team changed.' });
  expect((loadReadCards()[0].result.teams as Array<{ isSelected: boolean }>).every((team) => !team.isSelected)).toBe(true);
  const selected = vi.fn(); window.addEventListener('f1:selected-team-changed', selected);
  const receipt = renderCard(loadReadCards()[1]);
  expect(receipt.textContent).toContain('Team changed.');
  expect(selected).not.toHaveBeenCalled();
  window.removeEventListener('f1:selected-team-changed', selected);
  clear(); expect(loadReadCards()).toEqual([]);
});

test('a completed conversational confirmation stays settled after restoring text', () => {
  const messages = conversation('activate_chip', { status: 'confirmation_required', tool: 'activate_chip', writeNonce: 'nonce', summary: 'Activate Limitless.' });
  messages.push(...conversation('confirm_write', { status: 'ok', tool: 'activate_chip', summary: 'Limitless activated.' }, { writeNonce: 'nonce' })
    .slice(1).map((message) => message.role === 'assistant' && message.toolCalls
      ? { ...message, id: 'commit-call-message', toolCalls: message.toolCalls.map((call) => ({ ...call, id: 'commit-call' })) }
      : message.role === 'tool' ? { ...message, id: 'commit-result', toolCallId: 'commit-call' } : { ...message, id: 'commit-answer' }));
  saveReadCards(messages);
  expect(loadReadCards()[0].decision).toBe('confirmed');
  saveReadCards(toAgUiMessages(toStoredMessages(messages)));
  const confirmed = renderCard();
  expect(confirmed.querySelector('button:not([disabled])')).toBeNull();
});

test('direct removal preserves the updated followed-team grid instead of resurrecting the removed team', () => {
  const messages = conversation('list_followed_teams', fixtures.list_followed_teams);
  saveReadCards(messages);
  saveDirectCard(messages, 'follow_team', { action: 'remove', teamId: 'T1' }, {
    status: 'confirmation_required', tool: 'follow_team', writeNonce: 'remove-nonce', summary: 'Stop tracking.',
  });
  saveCardDecision('remove-nonce', 'confirmed', { status: 'ok', tool: 'follow_team', teamId: 'T1', fallbackSelectedTeam: null, summary: 'Stopped tracking.' });
  saveReadCards(messages);
  expect(loadReadCards()[0].result.teams).toEqual([]);
});

test('large cards above the old 100 KB limit survive and only the bounded history is retained', () => {
  const result = { status: 'ok', lang: 'he', summary: 'א'.repeat(100_000) };
  saveReadCards(conversation('get_race_summary', result));
  expect(loadReadCards()[0].result).toEqual(result);
});
