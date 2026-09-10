import { TransferPlayerTile, MetricNumber, type TransferPlayer as Player } from './TransferPlayerTile';
import './BestTeamChangesCard.css';
import { useCopilotAction } from '@copilotkit/react-core';
import { ActionChoicesCard } from './ActionChoicesCard';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type Result = {
  status: string; lang?: string; calculationId?: string; row?: number; teamName?: string;
  request?: Record<string, unknown>; rows?: number[]; noChanges?: boolean;
  driversToRemove?: string[]; driversToAdd?: string[]; constructorsToRemove?: string[]; constructorsToAdd?: string[];
  outgoingDrivers?: Player[]; incomingDrivers?: Player[]; outgoingConstructors?: Player[]; incomingConstructors?: Player[];
  captainPlayer?: Player; extraBoostPlayer?: Player; newBoost?: string; extraBoostDriver?: string;
  captain?: string; extraBoost?: string; chipToActivate?: string;
  transfersNeeded?: number; penalty?: number; projectedPoints?: number; deltaPoints?: number;
  expectedPriceChange?: number; targetBudgetAdjustedPoints?: number; deltaBudgetAdjustedPoints?: number;
  budgetChangePointsPerMillion?: number; drivers?: Player[]; constructors?: Player[];
};
export function RecommendationButton({ calculationId, row, lang }: { calculationId: string; row: number; lang?: string }) {
  return <ActionChoicesCard compact result={{ status: 'selection_required', choice: 'recommendation', lang,
    options: [{ label: lang === 'he' ? 'הצג שינויים' : 'Show changes', accessibleLabel: lang === 'he' ? `הצג שינויים #${row}` : `Show changes #${row}`, action: 'get_best_team_changes', args: { calculationId, row } }] }} />;
}
export function BestTeamChangesCard({ result }: { result?: Result }) {
  if (!result) return null;
  const he = result.lang === 'he';
  const label = (en: string, hebrew: string) => he ? hebrew : en;
  const chipLabels: Record<string, string> = { EXTRA_BOOST: label('Extra Boost', 'אקסטרה בוסט'), WILDCARD: label('Wildcard', 'ווילדקארד'), LIMITLESS: label('Limitless', 'ללא הגבלה') };
  const legacy = (codes: string[] = []) => codes.map((code) => ({ id: code, code, ambiguousCode: true }));
  const matches = (player: Player, identity: Player | undefined, code: string | undefined) => identity
    ? player.id === identity.id
    : player.code === code && (result.drivers || []).filter((item) => item.code === code).length === 1;
  const tiles = (players: Player[], kind: 'driver' | 'constructor', metrics = false) => <div className="transfer-plan__tiles">{players.map((player, index) => <TransferPlayerTile key={`${player.id}-${index}`} player={player} kind={kind} he={he} metrics={metrics}
    captain={metrics && kind === 'driver' && matches(player, result.captainPlayer, result.captain)} boost={metrics && kind === 'driver' && matches(player, result.extraBoostPlayer, result.extraBoost)} />)}</div>;
  const changes = (title: string, kind: 'driver' | 'constructor', out: Player[], incoming: Player[]) => out.length || incoming.length ? <section className="transfer-plan__category"><h4>{title}</h4><div className="transfer-plan__transfer-group">
    <div><h5>{label('Out', 'הסר')}</h5>{tiles(out, kind)}</div><span className="transfer-plan__arrow" aria-hidden="true">{he ? '←' : '→'}</span><div><h5>{label('In', 'הוסף')}</h5>{tiles(incoming, kind)}</div>
  </div></section> : null;
  const metric = (title: string, value?: number, signed = false, money = false) => <div><dt>{title}</dt><dd><MetricNumber value={value} signed={signed} digits={money ? 2 : 1} money={money} /></dd></div>;
  if (result.status !== 'ok') {
    const invalid = result.status === 'invalid_selection';
    const outdated = result.status === 'outdated_result';
    const options = invalid ? (result.rows || []).map((row) => ({ label: `${label('Show changes', 'הצג שינויים')} #${row}`, action: 'get_best_team_changes', args: { calculationId: result.calculationId, row } })) :
      [{ label: outdated ? label('Recalculate', 'חשב מחדש') : label('Calculate best teams', 'חשב קבוצות מומלצות'), action: 'get_best_teams', args: result.request || {} }];
    return <section dir={he ? 'rtl' : 'ltr'}><p role="status">{invalid ? label('Choose an available recommendation.', 'בחר המלצה זמינה.') : outdated ? label('These recommendations are outdated. Recalculate and choose again.', 'ההמלצות אינן עדכניות. חשב מחדש ובחר שוב.') : label('The calculation is unavailable. Calculate best teams to select a recommendation.', 'החישוב אינו זמין. חשב קבוצות מומלצות כדי לבחור המלצה.')}</p>
      <ActionChoicesCard result={{ status: 'selection_required', choice: 'recommendation', lang: result.lang, options }} /></section>;
  }
  return <article className="transfer-plan" dir={he ? 'rtl' : 'ltr'}>
    <header className="transfer-plan__header"><div><span className="transfer-plan__eyebrow">{label('Transfer plan', 'תוכנית העברות')} <bdi>#{result.row}</bdi></span><h3><bdi>{result.teamName}</bdi></h3></div>
      <span className="transfer-plan__badge"><MetricNumber value={result.transfersNeeded} digits={0} /> {label('transfers', 'העברות')}</span>
      {!!result.penalty && <span className="transfer-plan__penalty">{label('Penalty', 'קנס')}: <MetricNumber value={result.penalty} digits={0} /></span>}
    </header>
    <dl className="transfer-plan__summary">
      {metric(label('Projected points', 'נקודות חזויות'), result.projectedPoints)}{metric(label('Improvement', 'שיפור'), result.deltaPoints, true)}
      {metric(label('Expected price change', 'שינוי מחיר צפוי'), result.expectedPriceChange, true, true)}
      {!!result.budgetChangePointsPerMillion && <>{metric(label('Budget-adjusted points', 'נקודות מותאמות תקציב'), result.targetBudgetAdjustedPoints)}{metric(label('Budget-adjusted improvement', 'שיפור מותאם תקציב'), result.deltaBudgetAdjustedPoints, true)}</>}
    </dl>
    {result.noChanges ? <p className="transfer-plan__empty" role="status">{label('No changes needed.', 'אין צורך בשינויים.')}</p> : <>
      {changes(label('Drivers', 'נהגים'), 'driver', result.outgoingDrivers || legacy(result.driversToRemove), result.incomingDrivers || legacy(result.driversToAdd))}
      {changes(label('Constructors', 'קבוצות'), 'constructor', result.outgoingConstructors || legacy(result.constructorsToRemove), result.incomingConstructors || legacy(result.constructorsToAdd))}
      {(result.newBoost || result.extraBoostDriver || chipLabels[result.chipToActivate || '']) && <section className="transfer-plan__assignments">
        {result.newBoost && <div><h4>{label('Set captain', 'בחר קפטן')}</h4>{tiles([result.captainPlayer || legacy([result.newBoost])[0]], 'driver')}</div>}
        {result.extraBoostDriver && <div><h4>{label('Extra Boost', 'אקסטרה בוסט')}</h4>{tiles([result.extraBoostPlayer || legacy([result.extraBoostDriver])[0]], 'driver')}</div>}
        {chipLabels[result.chipToActivate || ''] && <p>{label('Activate chip', 'הפעל צ׳יפ')}: <strong>{chipLabels[result.chipToActivate!]}</strong></p>}
      </section>}
    </>}
    <details className="transfer-plan__roster"><summary>{label('View final roster', 'הצג הרכב סופי')}</summary>
      {!!result.drivers?.length && <section><h4>{label('Drivers', 'נהגים')}</h4>{tiles(result.drivers, 'driver', true)}</section>}
      {!!result.constructors?.length && <section><h4>{label('Constructors', 'קבוצות')}</h4>{tiles(result.constructors, 'constructor', true)}</section>}
    </details>
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
