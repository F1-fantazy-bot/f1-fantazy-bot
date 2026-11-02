import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { AvailableChipsCard } from './AvailableChipsCard';
import { ToolLoading } from './ToolLoading';
import { UiLanguageProvider } from './uiLanguage';
vi.mock('@copilotkit/react-core/v2', () => ({ UseAgentUpdate: { OnRunStatusChanged: 'status' }, useAgent: () => ({ agent: { isRunning: false, messages: [], subscribe: () => ({ unsubscribe() {} }) } }), useCopilotKit: () => ({ copilotkit: {} }) }));
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach((root) => act(() => root.unmount())); document.body.innerHTML = ''; });
function render(node: React.ReactNode) { const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root); act(() => root.render(node)); return container; }
test.each(['en', 'he'])('accessible compact table preserves unknown/empty and timestamps in %s', (lang) => {
  const container = render(<AvailableChipsCard result={{ status: 'ok', lang, partial: true, teams: [
    { teamName: '<b>Rocket</b>', availableChips: ['Wildcard', 'Final Fix'], updatedAt: '2026-11-02T12:30:00Z' },
    { teamName: 'Used', availableChips: [], updatedAt: null },
    { teamName: 'Unknown', availableChips: null, updatedAt: null },
  ] }} />);
  expect(container.querySelector('section')?.dir).toBe(lang === 'he' ? 'rtl' : 'ltr');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(3);
  expect(container.querySelector('time')?.dateTime).toBe('2026-11-02T12:30:00Z');
  expect(container.querySelector('tbody b')).toBeNull();
  expect(container.textContent).toContain('<b>Rocket</b>');
  expect(container.textContent).toContain(lang === 'he' ? 'לא נותרו צ׳יפים' : 'None remaining');
  expect(container.textContent).toContain(lang === 'he' ? 'נתוני השימוש אינם זמינים' : 'Usage unavailable');
});
test.each(['empty', 'no_followed_leagues', 'not_followed', 'unavailable'])('renders %s without inventing chips', (status) => {
  const container = render(<AvailableChipsCard result={{ status, lang: 'he' }} />);
  expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  expect(container.querySelector('table')).toBeNull();
});
test('loading and shared errors are localized before a data payload exists', () => {
  expect(render(<UiLanguageProvider initialLanguage="he"><ToolLoading kind="availableChips" /></UiLanguageProvider>).textContent).toContain('טוען צ׳יפים שנותרו');
  const container = render(<AvailableChipsCard result={{ status: 'tool_error', lang: 'he' }} />);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
