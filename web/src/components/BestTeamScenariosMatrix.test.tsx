import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { BestTeamScenariosMatrix } from './BestTeamScenariosMatrix';
import { WorkflowResult } from './workflowRenderers';
vi.mock('@copilotkit/react-core/v2', () => ({ UseAgentUpdate: { OnRunStatusChanged: 'status' }, useAgent: () => ({ agent: { isRunning: false, messages: [], subscribe: () => ({ unsubscribe() {} }) } }), useCopilotKit: () => ({ copilotkit: {} }) }));
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach((root) => act(() => root.unmount())); document.body.innerHTML = ''; });
function render(node: React.ReactNode) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root); act(() => root.render(node)); return container;
}
const chips = [
  { chipKey: null, chipLabel: 'Without Chip', projectedPoints: 100, expectedPriceChange: 0.25, recommendation: null },
  { chipKey: 'LIMITLESS', chipLabel: 'Limitless', projectedPoints: 225, expectedPriceChange: null, recommendation: 'green' as const },
  { chipKey: 'EXTRA_BOOST', chipLabel: 'Extra Boost', projectedPoints: 160, expectedPriceChange: 0, recommendation: 'yellow' as const },
  { chipKey: 'WILDCARD', chipLabel: 'Wildcard', projectedPoints: 135, expectedPriceChange: -0.25, recommendation: 'green' as const },
];
function result(lang: string, used: number, status: 'known' | 'unknown' = 'known') {
  return { status: 'ok' as const, lang, teamName: 'Rocket', chipAvailability: { status, updatedAt: null },
    scenarios: [0, 1.3, 1.65, 2].map((ppm) => ({ ppm, ppmLabel: `Preset ${ppm}`,
      results: chips.filter((_, index) => index === 0 || (status === 'known' && !(used & (1 << (index - 1))))),
    })),
  };
}
test.each(['en', 'he'])('renders every supported subset with four baselines in %s', (lang) => {
  for (let used = 0; used < 8; used++) {
    const payload = result(lang, used);
    const container = render(<BestTeamScenariosMatrix result={payload} />);
    expect(container.firstElementChild?.getAttribute('dir')).toBe(lang === 'he' ? 'rtl' : 'ltr');
    expect(container.querySelectorAll('table')).toHaveLength(4);
    for (const table of container.querySelectorAll('table')) {
      expect(table.querySelectorAll('tbody tr')).toHaveLength(payload.scenarios[0].results.length);
      expect(table.querySelector('tbody tr')?.textContent).toContain(lang === 'he' ? "ללא צ'יפ" : 'Without Chip');
      expect(table.querySelector('tbody tr')?.textContent).toContain('100.0');
    }
    expect(container.textContent).not.toContain(lang === 'he' ? 'לא ניתן היה לאמת' : 'could not be verified');
  }
});
test.each(['en', 'he'])('unknown usage warning renders in standalone and workflow cards in %s', (lang) => {
  const payload = result(lang, 0, 'unknown');
  for (const node of [<BestTeamScenariosMatrix result={payload} />, <WorkflowResult tool="get_best_team_scenarios" result={payload} />]) {
    const container = render(node);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(container.textContent).toContain(lang === 'he'
      ? "לא ניתן היה לאמת את השימוש בצ'יפים; מוצגים רק תרחישים ללא צ'יפ."
      : 'Chip usage could not be verified; showing no-chip scenarios only.');
    expect(container.textContent).not.toMatch(/Limitless|Extra Boost|Wildcard|🟢(?=\s*\d)|🟡(?=\s*\d)/);
  }
});
test('each team in a workflow keeps its own chip rows and status', () => {
  const container = render(<>
    <WorkflowResult tool="get_best_team_scenarios" result={{ ...result('en', 3), teamName: 'Kilzid' }} />
    <WorkflowResult tool="get_best_team_scenarios" result={{ ...result('en', 7), teamName: 'Kilzid2' }} />
    <WorkflowResult tool="get_best_team_scenarios" result={{ ...result('he', 6), teamName: 'Kilzid 3' }} />
  </>);
  expect(Array.from(container.children).map((card) => card.querySelectorAll('tbody tr').length)).toEqual([8, 4, 8]);
  expect(container.children[0].textContent).toContain('Wildcard');
  expect(container.children[2].textContent).toContain('ללא הגבלה');
});
test('historical payloads without availability preserve all saved rows without a new warning', () => {
  const { chipAvailability: _availability, ...historical } = result('en', 0);
  const container = render(<BestTeamScenariosMatrix result={historical} />);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(16);
  expect(container.textContent).not.toContain('could not be verified');
  expect(container.textContent).toContain('🟢');
  expect(container.textContent).toContain('🟡');
  expect(container.textContent).toContain('—');
});
