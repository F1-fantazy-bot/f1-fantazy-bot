import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { LeaderboardTable } from './LeaderboardTable';
vi.mock('@copilotkit/react-core', () => ({ useCopilotAction: vi.fn() }));
vi.mock('@copilotkit/react-core/v2', () => ({ useAgent: vi.fn(), useCopilotKit: vi.fn(), UseAgentUpdate: {} }));
const standings = [
  { position: 1, teamName: 'Winner', userName: 'W', teamNo: 1, teamId: 'W_1', totalScore: 20, gapToLeader: 0, isSelected: false },
  { position: 1, teamName: 'Selected', userName: 'S', teamNo: 1, teamId: 'S_1', totalScore: 20, gapToLeader: 0, isSelected: true },
  { position: 3, teamName: 'Zero', userName: 'Z', teamNo: 1, teamId: 'Z_1', totalScore: 0, gapToLeader: -20, isSelected: false },
  { position: null, teamName: 'Unknown', userName: 'U', teamNo: 1, teamId: 'U_1', totalScore: null, gapToLeader: null, isSelected: false },
];
test.each(['en', 'he'])('renders season, race and legacy tables with unknowns in %s', (lang) => {
  for (const period of [undefined, 'season', 'race'] as const) {
    const html = renderToStaticMarkup(<LeaderboardTable result={{ status: 'ok', lang, period, leagueName: 'League', raceName: 'Austrian GP', raceFlag: '🇦🇹', matchdayId: 10, standings }} />);
    const element = document.createElement('div');
    element.innerHTML = html;
    expect(element.firstElementChild?.getAttribute('dir')).toBe(lang === 'he' ? 'rtl' : 'ltr');
    expect(element.textContent).toContain(period === 'race' ? '🇦🇹 Austrian GP' : lang === 'he' ? 'כל העונה' : 'Entire season');
    const rows = element.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    expect(rows[1].getAttribute('style')).toContain('var(--app-highlight-surface)');
    expect(rows[3].textContent).toBe('—Unknown——');
    expect(rows[2].textContent).toContain('-20');
    expect(rows[2].querySelector('td:last-child bdi')?.getAttribute('dir')).toBe('ltr');
  }
});
test.each(['en', 'he'])('unavailable race has a clear %s state without a table', (lang) => {
  const html = renderToStaticMarkup(<LeaderboardTable result={{ status: 'race_unavailable', lang, raceName: 'Monaco GP' }} />);
  expect(html).toContain(lang === 'he' ? 'אין ניקוד זמין למרוץ המבוקש.' : 'No scores are available for the requested race.');
  expect(html).toContain('Monaco GP');
  expect(html).not.toContain('<table');
});
