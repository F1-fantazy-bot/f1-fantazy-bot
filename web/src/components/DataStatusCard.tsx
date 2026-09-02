import { useCopilotAction } from '@copilotkit/react-core';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { directionFor, uiLanguageOf } from './uiLanguage';
import { ProjectionTables, type ProjectionData } from './ProjectionTables';

type Freshness = { status?: 'fresh' | 'stale' | 'unknown' };
type CachedTeam = {
  teamId?: string;
  teamName?: string;
  isSelected?: boolean;
  chip?: string | null;
  drivers?: string[];
  constructors?: string[];
  boost?: string | null;
  freeTransfers?: number | null;
  costCapRemaining?: number | null;
  budgetChangePointsPerMillion?: number | null;
};
type MissingPrerequisite =
  | 'simulation'
  | 'drivers'
  | 'constructors'
  | 'owned_team'
  | 'selected_team';
type NextAction =
  | 'refresh_simulation'
  | 'refresh_projections'
  | 'add_team'
  | 'select_team';

export type DataStatusResult = {
  status?: 'ok' | 'incomplete' | 'error';
  lang?: string;
  source?: 'simulation' | 'personal_or_mixed' | 'unavailable';
  simulation?: {
    status?: 'ok' | 'not_loaded';
    name?: string | null;
    matchday?: string | number | null;
    freshness?: Freshness;
  };
  projections?: { drivers?: number; constructors?: number; available?: boolean };
  teams?: { ownedCount?: number; selected?: string | null; hasSelectedTeam?: boolean };
  missingPrerequisites?: MissingPrerequisite[];
  nextActions?: NextAction[];
  cache?: { projections?: ProjectionData; teams?: CachedTeam[] };
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt style={{ color: 'var(--app-muted)', fontSize: 12 }}>{label}</dt>
      <dd style={{ margin: '3px 0 0', fontWeight: 700 }}>{value}</dd>
    </div>
  );
}

export function DataStatusCard({ result }: { result?: DataStatusResult }) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          title: 'מצב הנתונים',
          complete: 'הנתונים הנדרשים זמינים.',
          incomplete: 'חלק מהנתונים עדיין חסרים.',
          source: 'מקור התחזיות',
          simulation: 'סימולציה',
          matchday: 'מחזור',
          freshness: 'מצב הסימולציה',
          drivers: 'נהגים',
          constructors: 'קבוצות',
          owned: 'קבוצות שמורות',
          selected: 'קבוצה פעילה',
          missing: 'חסרים',
          next: 'הצעדים הבאים',
          cachedData: 'נתונים שמורים',
          savedRosters: 'הרכבים שמורים',
          selectedBadge: 'פעילה',
          driversLabel: 'נהגים',
          constructorsLabel: 'קבוצות',
          chip: 'צ׳יפ',
          captain: 'קפטן',
          freeTransfers: 'העברות חופשיות',
          costCap: 'תקציב נותר',
          pointsPerMillion: 'דירוג נקודות למיליון',
          noRosters: 'אין הרכבים שמורים להצגה.',
          error: 'לא ניתן להציג את מצב הנתונים כרגע.',
          sourceValues: {
            simulation: 'נתוני סימולציה',
            personal_or_mixed: 'נתונים אישיים או משולבים',
            unavailable: 'לא זמין',
          },
          freshnessValues: {
            fresh: 'עדכני',
            stale: 'ישן',
            unknown: 'לא ידוע',
          },
          missingValues: {
            simulation: 'סימולציה',
            drivers: 'תחזיות נהגים',
            constructors: 'תחזיות קבוצות',
            owned_team: 'קבוצה שמורה',
            selected_team: 'קבוצה פעילה',
          },
          actionValues: {
            refresh_simulation: 'נסה שוב לאחר רענון הסימולציה',
            refresh_projections: 'נסה שוב לאחר רענון התחזיות',
            add_team: 'הוסף קבוצה דרך הבוט',
            select_team: 'בחר קבוצה פעילה',
          },
          none: '—',
        }
      : {
          title: 'Data status',
          complete: 'The required data is available.',
          incomplete: 'Some required data is still missing.',
          source: 'Projection source',
          simulation: 'Simulation',
          matchday: 'Matchday',
          freshness: 'Simulation status',
          drivers: 'Drivers',
          constructors: 'Constructors',
          owned: 'Saved teams',
          selected: 'Active team',
          missing: 'Missing',
          next: 'Next steps',
          cachedData: 'Cached data',
          savedRosters: 'Saved rosters',
          selectedBadge: 'Active',
          driversLabel: 'Drivers',
          constructorsLabel: 'Constructors',
          chip: 'Chip',
          captain: 'Captain',
          freeTransfers: 'Free transfers',
          costCap: 'Cost cap remaining',
          pointsPerMillion: 'Points-per-million ranking',
          noRosters: 'No saved rosters are available to show.',
          error: 'The data status cannot be displayed right now.',
          sourceValues: {
            simulation: 'Simulation data',
            personal_or_mixed: 'Personal or mixed data',
            unavailable: 'Unavailable',
          },
          freshnessValues: {
            fresh: 'Current',
            stale: 'Old',
            unknown: 'Unknown',
          },
          missingValues: {
            simulation: 'simulation',
            drivers: 'driver projections',
            constructors: 'constructor projections',
            owned_team: 'a saved team',
            selected_team: 'an active team',
          },
          actionValues: {
            refresh_simulation: 'Try again after the simulation refreshes',
            refresh_projections: 'Try again after projections refresh',
            add_team: 'Add a team in the bot',
            select_team: 'Choose an active team',
          },
          none: '—',
        };
  const shellStyle = {
    margin: '8px 0',
    padding: 14,
    border: '1px solid var(--app-border)',
    borderRadius: 10,
    background: 'var(--app-surface)',
  } as const;

  if (!result || result.status === 'error') {
    return (
      <section role="alert" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0 }}>{labels.title}</h3>
        <p style={{ color: 'var(--app-danger-text)', marginBottom: 0 }}>
          {labels.error}
        </p>
      </section>
    );
  }

  if (result.status !== 'ok' && result.status !== 'incomplete') return null;

  const missing = result.missingPrerequisites || [];
  const actions = result.nextActions || [];
  const freshness = result.simulation?.freshness?.status ?? 'unknown';
  const cachedTeams = Array.isArray(result.cache?.teams) ? result.cache.teams : [];

  return (
    <article aria-label={labels.title} dir={directionFor(lang)} style={shellStyle}>
      <h3 style={{ margin: 0 }}>{labels.title}</h3>
      <p
        style={{
          color:
            result.status === 'ok'
              ? 'var(--app-success-text)'
              : 'var(--app-warning-text)',
          margin: '7px 0 0',
        }}
      >
        {result.status === 'ok' ? labels.complete : labels.incomplete}
      </p>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px 16px',
          margin: '14px 0 0',
        }}
      >
        <Metric label={labels.source} value={labels.sourceValues[result.source || 'unavailable']} />
        <Metric label={labels.simulation} value={result.simulation?.name || labels.none} />
        <Metric label={labels.matchday} value={result.simulation?.matchday ?? labels.none} />
        <Metric label={labels.freshness} value={labels.freshnessValues[freshness]} />
        <Metric label={labels.drivers} value={result.projections?.drivers ?? 0} />
        <Metric label={labels.constructors} value={result.projections?.constructors ?? 0} />
        <Metric label={labels.owned} value={result.teams?.ownedCount ?? 0} />
        <Metric label={labels.selected} value={result.teams?.selected || labels.none} />
      </dl>
      {missing.length ? (
        <section style={{ marginTop: 14 }}>
          <strong>{labels.missing}</strong>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
            {missing.map((item) => <li key={item}>{labels.missingValues[item]}</li>)}
          </ul>
        </section>
      ) : null}
      {actions.length ? (
        <section style={{ marginTop: 14 }}>
          <strong>{labels.next}</strong>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
            {actions.map((action) => <li key={action}>{labels.actionValues[action]}</li>)}
          </ul>
        </section>
      ) : null}
      <ProjectionTables
        projections={result.cache?.projections}
        lang={lang}
        title={labels.cachedData}
      />
      <section aria-label={labels.savedRosters} style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{labels.savedRosters}</h3>
        {cachedTeams.length === 0 ? (
          <p style={{ color: 'var(--app-muted)', marginBottom: 0 }}>{labels.noRosters}</p>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {cachedTeams.map((team) => (
              <section
                key={team.teamId || team.teamName}
                style={{ border: '1px solid var(--app-border)', borderRadius: 8, padding: 10 }}
              >
                <div style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <strong>{team.teamName || team.teamId || labels.none}</strong>
                  {team.isSelected ? (
                    <span style={{ color: 'var(--app-success-text)', fontSize: 12, fontWeight: 700 }}>
                      {labels.selectedBadge}
                    </span>
                  ) : null}
                </div>
                <dl
                  style={{
                    display: 'grid',
                    gap: '8px 14px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    margin: '10px 0 0',
                  }}
                >
                  <Metric label={labels.driversLabel} value={team.drivers?.join(', ') || labels.none} />
                  <Metric label={labels.constructorsLabel} value={team.constructors?.join(', ') || labels.none} />
                  {team.chip ? <Metric label={labels.chip} value={team.chip} /> : null}
                  {team.boost ? <Metric label={labels.captain} value={team.boost} /> : null}
                  <Metric
                    label={labels.pointsPerMillion}
                    value={formatPpm(team.budgetChangePointsPerMillion, lang)}
                  />
                  {typeof team.freeTransfers === 'number' ? <Metric label={labels.freeTransfers} value={team.freeTransfers} /> : null}
                  {typeof team.costCapRemaining === 'number' ? <Metric label={labels.costCap} value={team.costCapRemaining} /> : null}
                </dl>
              </section>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function formatPpm(value: number | null | undefined, lang: 'en' | 'he') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';

  return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function useDataStatusAction() {
  useCopilotAction({
    name: 'get_data_status',
    description: 'Show a safe F1 Fantasy data readiness diagnostic.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="dataStatus" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;

      return <DataStatusCard result={parsed as DataStatusResult | undefined} />;
    },
  });
}
