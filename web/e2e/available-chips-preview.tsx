// Offline browser fixture: no credentials or backend writes.
import { CopilotKit } from '@copilotkit/react-core';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AvailableChipsCard } from '../src/components/AvailableChipsCard';
import { ActionChoicesCard } from '../src/components/ActionChoicesCard';
import { UiLanguageProvider } from '../src/components/uiLanguage';
import { ToolLoading } from '../src/components/ToolLoading';
import '../src/index.css';
function Preview() {
  const he = new URLSearchParams(location.search).get('lang') === 'he';
  const lang = he ? 'he' : 'en';
  const [state, setState] = useState('ok');
  return <UiLanguageProvider initialLanguage={lang}><main style={{ maxWidth: 800, margin: '24px auto', padding: 12 }}>
    <nav>{['ok', 'empty', 'unavailable', 'tool_error', 'loading', 'scope', 'team'].map((value) => <button type="button" key={value} onClick={() => setState(value)}>{value}</button>)}</nav>
    {state === 'loading' ? <ToolLoading kind="availableChips" /> : ['scope', 'team'].includes(state) ? <CopilotKit runtimeUrl="/offline-fixture-runtime"><ActionChoicesCard result={{ status: 'selection_required', lang, choice: state as 'scope' | 'team', options: state === 'scope'
      ? ['One team', 'All tracked teams', 'Entire league'].map((label, index) => ({ label: he ? ['קבוצה אחת', 'כל הקבוצות במעקב', 'ליגה שלמה'][index] : label, action: 'get_available_chips', args: { scope: ['team', 'tracked', 'league'][index] } }))
      : Array.from({ length: 41 }, (_, index) => ({ label: `Team ${index}`, action: 'get_available_chips', args: { scope: 'team', leagueCode: 'A', teamId: `Owner_${index}_abc` } })) }} /></CopilotKit>
      : <AvailableChipsCard result={{ status: state, lang, partial: true, teams: [
        { teamName: 'kilzid1', availableChips: ['Wildcard', 'Final Fix', 'Autopilot'], updatedAt: '2026-11-02T12:00:00Z', leagues: [{ leagueCode: 'A', leagueName: 'Friends' }] },
        { teamName: 'All used', availableChips: [], updatedAt: '2026-11-01T12:00:00Z' },
        { teamName: 'נתונים חסרים', availableChips: null, updatedAt: null },
      ] }} />}
  </main></UiLanguageProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
