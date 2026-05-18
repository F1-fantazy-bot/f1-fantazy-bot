import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type ScenarioResult = {
  chipKey: string | null;
  chipLabel: string;
  projectedPoints: number | null;
  expectedPriceChange: number | null;
  recommendation: 'green' | 'yellow' | null;
};

type ScenarioRow = {
  ppm: number;
  ppmLabel: string;
  results: ScenarioResult[];
};

type BestTeamScenariosResult = {
  status?: 'ok' | 'no_teams' | 'unknown_team' | 'ambiguous_team' | 'missing_cache';
  teamId?: string;
  teamName?: string;
  chip?: string | null;
  scenarios?: ScenarioRow[];
  teamIds?: string[];
};

function recommendationDot(level: ScenarioResult['recommendation']): string {
  if (level === 'green') return ' 🟢';
  if (level === 'yellow') return ' 🟡';
  return '';
}

function formatDelta(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return '0';
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function BestTeamScenariosMatrix({
  result,
}: {
  result?: BestTeamScenariosResult;
}) {
  if (!result || !result.status) return null;

  if (result.status === 'no_teams') {
    return (
      <div style={{ padding: 12, color: '#7a4a00' }}>
        You don't have any tracked teams yet.
      </div>
    );
  }

  if (result.status === 'missing_cache') {
    return (
      <div style={{ padding: 12, color: '#7a4a00' }}>
        Missing cached data for this team. Upload current team data via the
        Telegram bot first.
      </div>
    );
  }

  if (result.status === 'unknown_team') {
    return (
      <div style={{ padding: 12, color: '#a32020' }}>
        Couldn't find a matching team.
      </div>
    );
  }

  if (result.status === 'ambiguous_team') {
    return (
      <div style={{ padding: 12, color: '#7a4a00' }}>
        Multiple tracked teams — specify which one.
      </div>
    );
  }

  const scenarios = result.scenarios ?? [];
  if (scenarios.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        margin: '8px 0',
        border: '1px solid #e2e6ee',
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: '#f6f8fb',
          borderBottom: '1px solid #e2e6ee',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>
          📊 Best Team Scenarios — {result.teamName}
        </div>
        <div style={{ color: '#7d8693', fontSize: 11, marginTop: 2 }}>
          Top team per ppm preset × chip combination. 🟢/🟡 indicate chip lift
          vs. no-chip baseline of the same row.
        </div>
      </div>

      {scenarios.map((row) => (
        <div
          key={row.ppm}
          style={{ borderTop: '1px solid #f0f2f6', padding: '10px 14px' }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: '#1f2937',
              marginBottom: 6,
            }}
          >
            {row.ppmLabel}{' '}
            <span style={{ color: '#7d8693', fontWeight: 400 }}>
              ({row.ppm} pts / $M)
            </span>
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ color: '#7d8693', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Scenario</th>
                <th
                  style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500 }}
                >
                  Pts
                </th>
                <th
                  style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500 }}
                >
                  Δ price
                </th>
              </tr>
            </thead>
            <tbody>
              {row.results.map((cell, idx) => {
                const isBaseline = idx === 0;
                const dot = recommendationDot(cell.recommendation);
                return (
                  <tr
                    key={cell.chipLabel}
                    style={{
                      background: isBaseline ? 'transparent' : '#fafbfd',
                      borderTop: idx === 0 ? 'none' : '1px solid #f5f7fa',
                    }}
                  >
                    <td
                      style={{
                        padding: '4px 8px',
                        fontWeight: isBaseline ? 600 : 400,
                        color: '#1f2937',
                      }}
                    >
                      {cell.chipLabel}
                      {dot}
                    </td>
                    <td
                      style={{
                        padding: '4px 8px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: isBaseline ? 700 : 500,
                      }}
                    >
                      {cell.projectedPoints !== null
                        ? cell.projectedPoints.toFixed(1)
                        : '—'}
                    </td>
                    <td
                      style={{
                        padding: '4px 8px',
                        textAlign: 'right',
                        color: '#7d8693',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatDelta(cell.expectedPriceChange)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function useBestTeamScenariosAction() {
  useCopilotAction({
    name: 'get_best_team_scenarios',
    description:
      'Compare best teams across the 4 budget-adjusted weight presets × 4 chip scenarios.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: '#666' }}>
            Computing scenarios…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <BestTeamScenariosMatrix
          result={parsed as BestTeamScenariosResult | undefined}
        />
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
