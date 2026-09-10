import { useCopilotAction } from '@copilotkit/react-core';
import { ActionChoicesCard } from './ActionChoicesCard';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type Player = { id: string; code: string; expectedPoints?: number; expectedPriceChange?: number; price?: number };
type Result = {
  status: string; lang?: string; calculationId?: string; row?: number; teamName?: string;
  request?: Record<string, unknown>; rows?: number[]; noChanges?: boolean;
  driversToRemove?: string[]; driversToAdd?: string[]; constructorsToRemove?: string[]; constructorsToAdd?: string[];
  captain?: string; extraBoost?: string; chipToActivate?: string;
  transfersNeeded?: number; penalty?: number; projectedPoints?: number; deltaPoints?: number;
  expectedPriceChange?: number; targetBudgetAdjustedPoints?: number; deltaBudgetAdjustedPoints?: number;
  budgetChangePointsPerMillion?: number; drivers?: Player[]; constructors?: Player[];
};
export function RecommendationButton({ calculationId, row, lang }: { calculationId: string; row: number; lang?: string }) {
  return <ActionChoicesCard compact result={{ status: 'selection_required', choice: 'recommendation', lang,
    options: [{ label: lang === 'he' ? `הצג שינויים #${row}` : `Show changes #${row}`, action: 'get_best_team_changes', args: { calculationId, row } }] }} />;
}
export function BestTeamChangesCard({ result }: { result?: Result }) {
  if (!result) return null;
  const he = result.lang === 'he';
  const label = (en: string, hebrew: string) => he ? hebrew : en;
  const chipLabels: Record<string, string> = { EXTRA_BOOST: label('Extra Boost', 'אקסטרה בוסט'), WILDCARD: label('Wildcard', 'ווילדקארד'), LIMITLESS: label('Limitless', 'ללא הגבלה') };
  const number = (value?: number, signed = false) => <bdi dir="ltr">{typeof value === 'number' ? `${signed && value >= 0 ? '+' : ''}${value.toFixed(2)}` : '—'}</bdi>;
  const changes = (title: string, remove: string[] = [], add: string[] = []) => <section><h4>{title}</h4>
    <p>{label('Remove', 'הסר')}: <bdi>{remove.join(', ') || '—'}</bdi></p>
    <p>{label('Add', 'הוסף')}: <bdi>{add.join(', ') || '—'}</bdi></p></section>;
  const roster = (title: string, players: Player[] = []) => <section><h4>{title}</h4><ul>{players.map((player) => <li key={player.id}><bdi>{player.code}</bdi>: {number(player.expectedPoints)} {label('points', 'נקודות')} · {number(player.price)} M · {number(player.expectedPriceChange, true)} M</li>)}</ul></section>;
  if (result.status !== 'ok') {
    const invalid = result.status === 'invalid_selection';
    const outdated = result.status === 'outdated_result';
    const options = invalid ? (result.rows || []).map((row) => ({ label: `${label('Show changes', 'הצג שינויים')} #${row}`, action: 'get_best_team_changes', args: { calculationId: result.calculationId, row } })) :
      [{ label: outdated ? label('Recalculate', 'חשב מחדש') : label('Calculate best teams', 'חשב קבוצות מומלצות'), action: 'get_best_teams', args: result.request || {} }];
    return <section dir={he ? 'rtl' : 'ltr'}><p role="status">{invalid ? label('Choose an available recommendation.', 'בחר המלצה זמינה.') : outdated ? label('These recommendations are outdated. Recalculate and choose again.', 'ההמלצות אינן עדכניות. חשב מחדש ובחר שוב.') : label('The calculation is unavailable. Calculate best teams to select a recommendation.', 'החישוב אינו זמין. חשב קבוצות מומלצות כדי לבחור המלצה.')}</p>
      <ActionChoicesCard result={{ status: 'selection_required', choice: 'recommendation', lang: result.lang, options }} /></section>;
  }
  return <article dir={he ? 'rtl' : 'ltr'} style={{ padding: 16, border: '1px solid var(--app-border)', borderRadius: 12 }}>
    <h3>{label('Transfer plan', 'תוכנית העברות')} — <bdi>{result.teamName}</bdi> <bdi>#{result.row}</bdi></h3>
    {result.noChanges && <p>{label('No changes needed.', 'אין צורך בשינויים.')}</p>}
    {changes(label('Drivers', 'נהגים'), result.driversToRemove, result.driversToAdd)}
    {changes(label('Constructors', 'קבוצות'), result.constructorsToRemove, result.constructorsToAdd)}
    <p>{label('Captain', 'קפטן')}: <bdi>{result.captain}</bdi></p>
    <p>{label('Extra Boost', 'אקסטרה בוסט')}: <bdi>{result.extraBoost || '—'}</bdi></p>
    <p>{label('Required chip', 'צ׳יפ נדרש')}: <bdi>{chipLabels[result.chipToActivate || ''] || label('None', 'ללא')}</bdi></p>
    <p>{label('Transfers', 'העברות')}: {number(result.transfersNeeded)} · {label('Penalty', 'קנס')}: {number(result.penalty)}</p>
    <p>{label('Projected points', 'נקודות חזויות')}: {number(result.projectedPoints)} · {label('Improvement', 'שיפור')}: {number(result.deltaPoints, true)}</p>
    <p>{label('Expected price change', 'שינוי מחיר צפוי')}: {number(result.expectedPriceChange, true)} M</p>
    {!!result.budgetChangePointsPerMillion && <p>{label('Budget-adjusted points / improvement', 'נקודות מותאמות תקציב / שיפור')}: {number(result.targetBudgetAdjustedPoints)} / {number(result.deltaBudgetAdjustedPoints, true)}</p>}
    <h3>{label('Resulting roster projections', 'תחזית ההרכב הסופי')}</h3>
    {roster(label('Drivers', 'נהגים'), result.drivers)}{roster(label('Constructors', 'קבוצות'), result.constructors)}
  </article>;
}
export function useBestTeamChangesAction() {
  useCopilotAction({ name: 'get_best_team_changes', parameters: [], available: 'frontend', render: ({ status, result }) => {
    if (status === 'inProgress' || status === 'executing') return <ToolLoading kind="bestTeamChanges" />;
    const parsed = safeParse(result);
    if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;
    return <BestTeamChangesCard result={parsed as Result | undefined} />;
  } });
}
