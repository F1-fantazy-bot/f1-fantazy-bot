import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, uiLanguageOf } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

type TeamInfo = {
  totalPrice?: number;
  costCapRemaining?: number;
  overallBudget?: number;
  teamExpectedPoints?: number;
  teamPriceChange?: number;
};

type CurrentTeamResult = {
  lang?: string;
  status?:
    | 'ok'
    | 'no_teams'
    | 'unknown_team'
    | 'ambiguous_team'
    | 'missing_cache'
    | 'projection_mismatch'
    | 'missing_weekend_format';
  teamId?: string;
  teamName?: string | null;
  chip?: string | null;
  drivers?: string[];
  constructors?: string[];
  boostDriver?: string | null;
  extraBoostDriver?: string | null;
  freeTransfers?: number | null;
  teamInfo?: TeamInfo;
  budgetChangePointsPerMillion?: number;
  budgetAdjustedPoints?: number | null;
  remainingRaceCount?: number | null;
  teamIds?: string[];
};

function fmt(value: number | undefined | null, digits = 2): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function localizedChip(chip: string, lang: 'en' | 'he'): string {
  if (lang !== 'he') return chip;
  const labels: Record<string, string> = {
    EXTRA_BOOST: 'אקסטרה בוסט',
    WILDCARD: 'ווילדקארד',
    LIMITLESS: 'ללא הגבלה',
    WITHOUT_CHIP: "ללא צ'יפ",
  };
  return labels[chip] ?? chip;
}

export function CurrentTeamCard({ result }: { result?: CurrentTeamResult }) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          noTeam:
            'עדיין אין לך קבוצה שמורה. יש להעלות צילום מסך או JSON בבוט הטלגרם.',
          missing:
            'חלק מנתוני הקבוצה עדיין אינם שמורים. יש לשלוח נתוני נהגים, קבוצות והקבוצה הנוכחית.',
          ambiguous: 'יש לך כמה קבוצות. נא לציין איזו קבוצה להציג.',
          unknown: 'לא נמצאה הקבוצה. האפשרויות הזמינות:',
          projectionMismatch:
            'נתוני התחזית אינם תואמים לרשימת המשתתפים הפעילים. נסה שוב לאחר עדכון הנתונים.',
          missingWeekend:
            'פורמט סוף השבוע של המרוץ הבא אינו זמין. נסה שוב לאחר עדכון נתוני המרוץ.',
          chip: "צ'יפ",
          drivers: 'נהגים',
          constructors: 'קבוצות',
          totalPrice: 'מחיר כולל',
          capRemaining: 'תקציב נותר',
          overallBudget: 'תקציב כולל',
          expectedPoints: 'נקודות חזויות',
          budgetAdjusted: 'מותאם תקציב',
          priceChange: 'שינוי מחיר חזוי',
          freeTransfers: 'העברות חינם',
        }
      : {
          noTeam:
            "You don't have a saved team yet. Upload a team screenshot or JSON in the Telegram bot first.",
          missing:
            "Some of your team data isn't cached yet. Send drivers, constructors, and current-team data first.",
          ambiguous: 'You have multiple teams. Tell me which one to show.',
          unknown: "Couldn't find that team. Available:",
          projectionMismatch:
            'Projection data does not match the active player list. Try after the next data refresh.',
          missingWeekend:
            'The next-race weekend format is unavailable. Try after race data refreshes.',
          chip: 'CHIP',
          drivers: 'Drivers',
          constructors: 'Constructors',
          totalPrice: 'Total price',
          capRemaining: 'Cost cap remaining',
          overallBudget: 'Overall budget',
          expectedPoints: 'Expected points',
          budgetAdjusted: 'Budget-adjusted',
          priceChange: 'Expected price Δ',
          freeTransfers: 'Free transfers',
        };
  if (!result || result.status === 'no_teams') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.noTeam}
      </div>
    );
  }

  if (result.status === 'missing_cache') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.missing}
      </div>
    );
  }

  if (result.status === 'ambiguous_team') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.ambiguous} ({result.teamIds?.join(', ') || '—'})
      </div>
    );
  }

  if (result.status === 'unknown_team') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.unknown} {result.teamIds?.join(', ') || '—'}.
      </div>
    );
  }

  if (result.status === 'projection_mismatch') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.projectionMismatch}
      </div>
    );
  }

  if (result.status === 'missing_weekend_format') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-warning-text)' }}
      >
        {labels.missingWeekend}
      </div>
    );
  }

  if (result.status !== 'ok') {
    return null;
  }

  const drivers = result.drivers || [];
  const constructors = result.constructors || [];
  const ti = result.teamInfo || {};
  const ppmActive =
    typeof result.budgetChangePointsPerMillion === 'number' &&
    result.budgetChangePointsPerMillion > 0;

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--app-surface-muted)',
          borderBottom: '1px solid var(--app-border)',
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 15 }}>
          {result.teamName || result.teamId}
        </strong>
        <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
          id: <code>{result.teamId}</code>
        </span>
        {result.chip ? (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--app-warning-surface)',
              color: 'var(--app-warning-text)',
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {labels.chip}: {localizedChip(result.chip, lang)}
          </span>
        ) : null}
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {labels.drivers}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {drivers.map((d) => {
            const isCaptain = d === result.boostDriver;
            const isMega = d === result.extraBoostDriver;
            return (
              <span
                key={d}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: isMega
                    ? 'var(--app-warning-surface)'
                    : isCaptain
                      ? 'var(--app-primary-surface)'
                      : 'var(--app-control-bg)',
                  color: isMega
                    ? 'var(--app-warning-text)'
                    : isCaptain
                      ? 'var(--app-primary)'
                      : 'var(--app-control-text)',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {isMega ? '🏆 ' : isCaptain ? '⭐ ' : ''}
                {d}
              </span>
            );
          })}
        </div>

        <div style={{ fontWeight: 700, margin: '12px 0 4px' }}>
          {labels.constructors}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {constructors.map((c) => (
            <span
              key={c}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--app-control-bg)',
                color: 'var(--app-control-text)',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--app-border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px 16px',
        }}
      >
        <Metric label={labels.totalPrice} value={fmt(ti.totalPrice)} unit="$M" />
        <Metric
          label={labels.capRemaining}
          value={fmt(ti.costCapRemaining)}
          unit="$M"
        />
        <Metric
          label={labels.overallBudget}
          value={fmt(ti.overallBudget)}
          unit="$M"
        />
        <Metric
          label={labels.expectedPoints}
          value={fmt(ti.teamExpectedPoints)}
        />
        {ppmActive && typeof result.budgetAdjustedPoints === 'number' ? (
          <Metric
            label={`${labels.budgetAdjusted} (ppm=${result.budgetChangePointsPerMillion})`}
            value={fmt(result.budgetAdjustedPoints)}
          />
        ) : null}
        <Metric label={labels.priceChange} value={fmt(ti.teamPriceChange)} />
        {typeof result.freeTransfers === 'number' ? (
          <Metric
            label={labels.freeTransfers}
            value={String(result.freeTransfers)}
          />
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          color: 'var(--app-subtle)',
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--app-primary-strong)',
        }}
      >
        {value}
        {unit ? (
          <span
            style={{
              fontSize: 11,
              marginLeft: 4,
              color: 'var(--app-subtle)',
              fontWeight: 500,
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function useCurrentTeamAction() {
  useCopilotAction({
    name: 'get_current_team',
    description:
      "Get the user's current saved roster — drivers, constructors, captain, chip, cost cap, projected points.",
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="currentTeam" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <CurrentTeamCard result={parsed as CurrentTeamResult | undefined} />
      );
    },
  });
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
