import { useEffect } from 'react';
import { isWriteResult, type WriteResult } from './WriteResultCard';
import { directionFor, useUiLanguage } from './uiLanguage';

type ResetImpact = {
  teamBlobs?: number;
  selectedTeam?: boolean;
  rankingPreferences?: number;
  selectedBestTeams?: number;
  chipPreferences?: number;
  driverProjectionOverride?: boolean;
  constructorProjectionOverride?: boolean;
};

export type ResetUserDataResult = WriteResult & {
  status: 'ok';
  tool: 'reset_user_data';
  impact?: ResetImpact;
};

export function isResetUserDataResult(
  value: unknown,
): value is ResetUserDataResult {
  return (
    isWriteResult(value) &&
    value.status === 'ok' &&
    value.tool === 'reset_user_data'
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt style={{ color: 'var(--app-muted)', fontSize: 12 }}>{label}</dt>
      <dd style={{ margin: '3px 0 0', fontWeight: 700 }}>{value}</dd>
    </div>
  );
}

export function ResetUserDataCard({ result }: { result: ResetUserDataResult }) {
  const { setLang } = useUiLanguage();
  const lang = result.uiLang === 'he' ? 'he' : 'en';
  const isHebrew = lang === 'he';
  const impact = result.impact || {};

  useEffect(() => {
    setLang(lang);
  }, [lang, setLang]);

  const labels = isHebrew
    ? {
        title: 'נתוני המשתמש אופסו',
        teams: 'קבוצות שנמחקו',
        activeTeam: 'קבוצה פעילה',
        ranking: 'העדפות דירוג',
        best: 'בחירות קבוצה מומלצת',
        chips: 'העדפות צ׳יפים',
        overrides: 'דריסות נתוני סימולציה',
        cleared: 'נמחק',
        none: 'לא היו',
        driver: 'נהגים',
        constructor: 'קבוצות',
      }
    : {
        title: 'User data reset',
        teams: 'Deleted teams',
        activeTeam: 'Active team',
        ranking: 'Ranking preferences',
        best: 'Saved best-team choices',
        chips: 'Chip preferences',
        overrides: 'Simulation overrides',
        cleared: 'Cleared',
        none: 'None saved',
        driver: 'Drivers',
        constructor: 'Constructors',
      };
  const overrideValue = `${labels.driver}: ${
    impact.driverProjectionOverride ? labels.cleared : labels.none
  } · ${labels.constructor}: ${
    impact.constructorProjectionOverride ? labels.cleared : labels.none
  }`;

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
          gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
          gap: '12px 16px',
          margin: '14px 0 0',
        }}
      >
        <Metric label={labels.teams} value={impact.teamBlobs ?? 0} />
        <Metric
          label={labels.activeTeam}
          value={impact.selectedTeam ? labels.cleared : labels.none}
        />
        <Metric label={labels.ranking} value={impact.rankingPreferences ?? 0} />
        <Metric label={labels.best} value={impact.selectedBestTeams ?? 0} />
        <Metric label={labels.chips} value={impact.chipPreferences ?? 0} />
        <Metric label={labels.overrides} value={overrideValue} />
      </dl>
    </article>
  );
}
