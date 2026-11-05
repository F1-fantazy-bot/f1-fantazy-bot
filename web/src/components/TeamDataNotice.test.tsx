import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('@copilotkit/react-core/v2', () => ({}));
import { TeamDataNotice, transferLabel, type TeamDataStatus } from './TeamDataNotice';
import { CurrentTeamCard } from './CurrentTeamCard';
import { BestTeamsTable } from './BestTeamsTable';
import { BestTeamScenariosMatrix } from './BestTeamScenariosMatrix';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const baseline: TeamDataStatus = { teamStateStatus: 'reconstructed-race-start', matchdayId: 18, teamStateMatchdayId: 16,
  budgetStatus: 'calculated-race-start', transfersStatus: 'calculated-race-start' };

test('labels the target race and starting allowance, not the archived source race', () => {
  act(() => root.render(<TeamDataNotice status={baseline} lang="en" />));
  expect(container.textContent).toContain('Starting roster for race 18');
  expect(container.textContent).toContain('this week’s usage is not included');
  expect(container.textContent).not.toContain('race 16');
});

test('unknown budget and unlimited transfers never display as zero or seven', () => {
  act(() => root.render(<CurrentTeamCard result={{ status: 'ok', lang: 'en', teamName: 'Sample',
    dataStatus: { ...baseline, budgetStatus: 'unknown', transfersStatus: 'unlimited' }, freeTransfers: null,
    teamInfo: { totalPrice: 70, costCapRemaining: null, overallBudget: null } }} />));
  expect(container.textContent).toContain('Budget unknown'); expect(container.textContent).toContain('Unlimited');
  expect(container.textContent).not.toContain('Free transfers7');
  expect(transferLabel(0, baseline, 'en')).toBe('0');
  expect(transferLabel(null, { transfersStatus: 'unknown' }, 'en')).toBe('Unknown');
});

test.each(['missing_team_budget', 'missing_team_transfers', 'missing_team_baseline', 'race_mismatch'] as const)('both recommendation views explain %s', (status) => {
  act(() => root.render(<><BestTeamsTable result={{ status, lang: 'en' }} /><BestTeamScenariosMatrix result={{ status, lang: 'en' }} /></>));
  expect(container.textContent).toMatch(/unavailable|unknown|different races/);
  expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
});

test('Hebrew starting-roster notice and transfers use localized copy', () => {
  act(() => root.render(<CurrentTeamCard result={{ status: 'ok', lang: 'he', dataStatus: baseline, freeTransfers: 2, teamName: 'Sample' }} />));
  expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  expect(container.textContent).toContain('הרכב פתיחה למרוץ 18');
  expect(container.textContent).not.toContain('Starting roster');
  expect(transferLabel(null, { transfersStatus: 'unlimited' }, 'he')).toBe('ללא הגבלה');
});
