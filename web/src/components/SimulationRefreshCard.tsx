import { useEffect } from 'react';
import { type WriteResult, isWriteResult } from './WriteResultCard';
import { directionFor, useUiLanguage } from './uiLanguage';

export type SimulationRefreshResult = WriteResult & {
  status: 'ok';
  tool: 'load_latest_simulation';
  source?: {
    kind?: string;
    label?: string;
  };
  // The backend intentionally sends this in the saved language and the
  // user's Asia/Jerusalem timezone, not as a raw ISO/UTC value.
  fetchedAt?: string | null;
  matchday?: string | number | null;
  counts?: {
    drivers?: number;
    constructors?: number;
  };
};

export function isSimulationRefreshResult(
  value: unknown,
): value is SimulationRefreshResult {
  return (
    isWriteResult(value) &&
    value.status === 'ok' &&
    value.tool === 'load_latest_simulation'
  );
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
      <dd style={{ margin: '3px 0 0', fontWeight: 700 }}>{value}</dd>
    </div>
  );
}

export function SimulationRefreshCard({
  result,
}: {
  result: SimulationRefreshResult;
}) {
  const { setLang } = useUiLanguage();
  const lang = result.uiLang === 'he' ? 'he' : 'en';
  const isHebrew = lang === 'he';

  useEffect(() => {
    setLang(lang);
  }, [lang, setLang]);

  const labels = isHebrew
    ? {
        title: 'הסימולציה רועננה',
        source: 'מקור',
        refreshed: 'רוענן',
        matchday: 'מחזור',
        drivers: 'נהגים',
        constructors: 'קבוצות',
        sharedSource: 'נתוני סימולציה משותפים ועמידים',
        noMatchday: 'לא זמין',
        noTime: 'לא זמין',
        processNote:
          'המטמון של תהליך הסוכן הזה רוענן. תהליכי בוט או סוכן אחרים שכבר פועלים מרעננים את המטמון שלהם בנפרד מאותו מקור משותף.',
      }
    : {
        title: 'Simulation refreshed',
        source: 'Source',
        refreshed: 'Refreshed',
        matchday: 'Matchday',
        drivers: 'Drivers',
        constructors: 'Constructors',
        sharedSource: 'Shared durable simulation data',
        noMatchday: 'Not available',
        noTime: 'Not available',
        processNote:
          'This agent process refreshed its own cache. Other already-running bot or agent processes refresh their own cache separately from the same shared source.',
      };

  return (
    <article
      aria-label={labels.title}
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        padding: 14,
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
      }}
    >
      <h3 style={{ margin: 0 }}>{labels.title}</h3>
      {result.summary ? (
        <p style={{ color: 'var(--app-muted)', margin: '7px 0 0' }}>
          {result.summary}
        </p>
      ) : null}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px 16px',
          margin: '14px 0 0',
        }}
      >
        <Metric label={labels.source} value={labels.sharedSource} wide />
        <Metric
          label={labels.refreshed}
          value={result.fetchedAt || labels.noTime}
        />
        <Metric
          label={labels.matchday}
          value={result.matchday ?? labels.noMatchday}
        />
        <Metric label={labels.drivers} value={result.counts?.drivers ?? 0} />
        <Metric
          label={labels.constructors}
          value={result.counts?.constructors ?? 0}
        />
      </dl>
      <p
        style={{
          color: 'var(--app-muted)',
          fontSize: 12,
          lineHeight: 1.45,
          margin: '14px 0 0',
        }}
      >
        {labels.processNote}
      </p>
    </article>
  );
}
