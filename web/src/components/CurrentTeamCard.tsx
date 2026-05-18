import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type TeamInfo = {
  totalPrice?: number;
  costCapRemaining?: number;
  overallBudget?: number;
  teamExpectedPoints?: number;
  teamPriceChange?: number;
};

type CurrentTeamResult = {
  status?:
    | 'ok'
    | 'no_teams'
    | 'unknown_team'
    | 'ambiguous_team'
    | 'missing_cache';
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

function CurrentTeamCard({ result }: { result?: CurrentTeamResult }) {
  if (!result || result.status === 'no_teams') {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        You don't have a saved team yet. Upload a team screenshot or JSON in
        the Telegram bot first.
      </div>
    );
  }

  if (result.status === 'missing_cache') {
    return (
      <div style={{ padding: 12, color: '#7a1f1f' }}>
        Some of your team data isn't cached yet. Send drivers / constructors /
        current-team images or JSON in the Telegram bot first.
      </div>
    );
  }

  if (result.status === 'ambiguous_team') {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        You have multiple teams ({result.teamIds?.join(', ') || '—'}). Tell me
        which one to show.
      </div>
    );
  }

  if (result.status === 'unknown_team') {
    return (
      <div style={{ padding: 12, color: '#7a1f1f' }}>
        Couldn't find that team. Available: {result.teamIds?.join(', ') || '—'}.
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
      style={{
        margin: '8px 0',
        border: '1px solid #e2e6ee',
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e6ee',
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 15 }}>
          {result.teamName || result.teamId}
        </strong>
        <span style={{ color: '#7d8693', fontSize: 11 }}>
          id: <code>{result.teamId}</code>
        </span>
        {result.chip ? (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: '#fff3c2',
              color: '#7a5a00',
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            CHIP: {result.chip}
          </span>
        ) : null}
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Drivers</div>
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
                    ? '#fff3c2'
                    : isCaptain
                      ? '#eef4ff'
                      : '#f1f3f7',
                  color: isMega ? '#7a5a00' : isCaptain ? '#1c4f99' : '#37404f',
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
          Constructors
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {constructors.map((c) => (
            <span
              key={c}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: '#f1f3f7',
                color: '#37404f',
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
          borderTop: '1px solid #eef0f5',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px 16px',
        }}
      >
        <Metric label="Total price" value={fmt(ti.totalPrice)} unit="$M" />
        <Metric
          label="Cost cap remaining"
          value={fmt(ti.costCapRemaining)}
          unit="$M"
        />
        <Metric
          label="Overall budget"
          value={fmt(ti.overallBudget)}
          unit="$M"
        />
        <Metric label="Expected points" value={fmt(ti.teamExpectedPoints)} />
        {ppmActive && typeof result.budgetAdjustedPoints === 'number' ? (
          <Metric
            label={`Budget-adjusted (ppm=${result.budgetChangePointsPerMillion})`}
            value={fmt(result.budgetAdjustedPoints)}
          />
        ) : null}
        <Metric label="Expected price Δ" value={fmt(ti.teamPriceChange)} />
        {typeof result.freeTransfers === 'number' ? (
          <Metric label="Free transfers" value={String(result.freeTransfers)} />
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
          color: '#7d8693',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1c3d70' }}>
        {value}
        {unit ? (
          <span
            style={{
              fontSize: 11,
              marginLeft: 4,
              color: '#7d8693',
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
        return (
          <div style={{ padding: 10, color: '#666' }}>
            Loading your current team…
          </div>
        );
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
