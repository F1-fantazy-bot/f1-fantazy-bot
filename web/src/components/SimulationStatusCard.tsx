import { useCopilotAction } from '@copilotkit/react-core';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import {
  directionFor,
  localeFor,
  uiLanguageOf,
  USER_TIME_ZONE,
} from './uiLanguage';
import { ProjectionTables, type ProjectionData } from './ProjectionTables';

type Freshness = {
  status?: 'fresh' | 'stale' | 'unknown';
  updatedAt?: string | null;
  updatedAtLocal?: string | null;
};

export type SimulationStatusResult = {
  status?: 'ok' | 'not_loaded' | 'error';
  lang?: string;
  source?: { kind?: 'simulation'; name?: string | null } | null;
  matchday?: string | number | null;
  lastUpdate?: string | null;
  freshness?: Freshness;
  available?: { drivers?: number; constructors?: number };
  projections?: ProjectionData;
};

function formatDate(value: string | null | undefined, lang: 'en' | 'he') {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat(localeFor(lang), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: USER_TIME_ZONE,
  }).format(date);
}

function freshnessCopy(freshness: Freshness | undefined, lang: 'en' | 'he') {
  const status = freshness?.status ?? 'unknown';
  const labels =
    lang === 'he'
      ? {
          fresh: 'עדכני',
          stale: 'ישן',
          unknown: 'לא ידוע',
        }
      : {
          fresh: 'Current',
          stale: 'Old',
          unknown: 'Unknown',
        };
  const label = labels[status];
  return label;
}

function Metric({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | number;
  wide?: boolean;
}) {
  return (
    <div style={wide ? { gridColumn: 'span 2', minWidth: 0 } : undefined}>
      <dt style={{ color: 'var(--app-muted)', fontSize: 12 }}>{label}</dt>
      <dd
        style={{
          margin: '3px 0 0',
          fontWeight: 700,
          overflowWrap: 'normal',
          wordBreak: 'normal',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

export function SimulationStatusCard({
  result,
}: {
  result?: SimulationStatusResult;
}) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          title: 'מצב הסימולציה',
          unavailable: 'נתוני סימולציה עדיין אינם זמינים.',
          hint: 'אפשר לנסות שוב לאחר רענון הנתונים.',
          source: 'מקור',
          matchday: 'מחזור',
          updated: 'עודכן',
          freshness: 'מצב הסימולציה',
          drivers: 'נהגים זמינים',
          constructors: 'קבוצות זמינות',
          projectionData: 'נתוני הסימולציה',
          error: 'לא ניתן להציג את מצב הסימולציה כרגע.',
          unnamed: 'סימולציה נטענת',
        }
      : {
          title: 'Simulation status',
          unavailable: 'Simulation data is not loaded yet.',
          hint: 'Try again after the data refresh completes.',
          source: 'Source',
          matchday: 'Matchday',
          updated: 'Updated',
          freshness: 'Simulation status',
          drivers: 'Available drivers',
          constructors: 'Available constructors',
          projectionData: 'Simulation data',
          error: 'The simulation status cannot be displayed right now.',
          unnamed: 'Loaded simulation',
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

  if (result.status === 'not_loaded') {
    return (
      <section aria-label={labels.title} dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0 }}>{labels.title}</h3>
        <p style={{ marginBottom: 0 }}>{labels.unavailable}</p>
        <p style={{ color: 'var(--app-muted)', marginBottom: 0 }}>{labels.hint}</p>
      </section>
    );
  }

  if (result.status !== 'ok') return null;

  const updated =
    result.freshness?.updatedAtLocal ||
    formatDate(result.freshness?.updatedAt, lang);

  return (
    <article aria-label={labels.title} dir={directionFor(lang)} style={shellStyle}>
      <h3 style={{ margin: 0 }}>{labels.title}</h3>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px 16px',
          margin: '14px 0 0',
        }}
      >
        <Metric
          label={labels.source}
          value={result.source?.name || labels.unnamed}
          wide
        />
        <Metric label={labels.matchday} value={result.matchday ?? '—'} />
        <Metric
          label={labels.freshness}
          value={freshnessCopy(result.freshness, lang)}
          wide
        />
        <Metric label={labels.drivers} value={result.available?.drivers ?? 0} />
        <Metric label={labels.constructors} value={result.available?.constructors ?? 0} />
        {updated ? <Metric label={labels.updated} value={updated} /> : null}
      </dl>
      <ProjectionTables
        projections={result.projections}
        lang={lang}
        title={labels.projectionData}
      />
    </article>
  );
}

export function useSimulationStatusAction() {
  useCopilotAction({
    name: 'get_simulation_status',
    description: 'Show safe status for the shared F1 Fantasy simulation.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="simulationStatus" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;

      return <SimulationStatusCard result={parsed as SimulationStatusResult | undefined} />;
    },
  });
}
