// Offline browser fixture: no credentials, backend reads, or writes.
import { createRoot } from 'react-dom/client';
import { BestTeamScenariosMatrix } from '../src/components/BestTeamScenariosMatrix';
import { WorkflowResult } from '../src/components/workflowRenderers';
import '../src/index.css';
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'he' ? 'he' : 'en';
const unknown = params.get('unknown') === '1';
const historical = params.get('historical') === '1';
const chips = [
  { chipKey: null, chipLabel: 'Without Chip', projectedPoints: 100, expectedPriceChange: 0.25, recommendation: null },
  { chipKey: 'LIMITLESS', chipLabel: 'Limitless', projectedPoints: 225, expectedPriceChange: 0, recommendation: 'green' as const },
  { chipKey: 'EXTRA_BOOST', chipLabel: 'Extra Boost', projectedPoints: 160, expectedPriceChange: 0.5, recommendation: 'yellow' as const },
  { chipKey: 'WILDCARD', chipLabel: 'Wildcard', projectedPoints: 135, expectedPriceChange: -0.25, recommendation: 'green' as const },
];
function payload(teamName: string, available: string[]) {
  return { status: 'ok' as const, lang, teamName,
    ...(historical ? {} : { chipAvailability: { status: unknown ? 'unknown' as const : 'known' as const, updatedAt: '2026-11-02T12:00:00Z' } }),
    scenarios: [0, 1.3, 1.65, 2].map((ppm) => ({ ppm, ppmLabel: `Preset ${ppm}`, results: chips.filter((chip) =>
      historical || chip.chipKey === null || (!unknown && available.includes(chip.chipKey))),
    })),
  };
}
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 760, margin: '24px auto', padding: 12 }}>
  <BestTeamScenariosMatrix result={payload('Kilzid', ['WILDCARD'])} />
  <WorkflowResult tool="get_best_team_scenarios" result={payload('Kilzid2', [])} />
  <WorkflowResult tool="get_best_team_scenarios" result={payload('Kilzid 3', ['LIMITLESS'])} />
</main>);
