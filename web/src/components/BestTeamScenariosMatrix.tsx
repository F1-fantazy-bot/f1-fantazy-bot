import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, uiLanguageOf, type UiLanguage } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

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

function scenarioChipLabel(
  cell: ScenarioResult,
  lang: UiLanguage,
  isBaseline: boolean,
): string {
  if (lang !== 'he') return cell.chipLabel;
  if (isBaseline || cell.chipLabel === 'Without Chip') {
    return "ללא צ'יפ";
  }
  switch (cell.chipKey) {
    case 'LIMITLESS':
      return 'ללא הגבלה';
    case 'EXTRA_BOOST':
      return 'אקסטרה בוסט';
    case 'WILDCARD':
      return 'ווילדקארד';
    case null:
    case 'WITHOUT_CHIP':
      return "ללא צ'יפ";
    default:
      return cell.chipLabel;
  }
}

function scenarioPpmLabel(
  row: ScenarioRow,
  lang: UiLanguage,
): string {
  if (lang !== 'he') return row.ppmLabel;
  const known: Record<number, string> = {
    0: 'נקודות בלבד',
    1.3: 'נטייה לנקודות',
    1.65: 'נקודות עם ערך לתקציב',
    2: 'איזון עם ערך לתקציב',
  };
  return known[row.ppm] ?? row.ppmLabel;
}

export function BestTeamScenariosMatrix({
  result,
}: {
  result?: BestTeamScenariosResult;
}) {
  if (!result || !result.status) return null;
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          noTeams: 'עדיין אין לך קבוצות במעקב.',
          missingCache:
            'חסרים נתונים שמורים לקבוצה זו. יש להעלות תחילה את נתוני הקבוצה הנוכחית דרך טלגרם.',
          unknownTeam: 'לא נמצאה קבוצה מתאימה.',
          ambiguous: 'יש כמה קבוצות במעקב — נא לציין איזו קבוצה.',
          projectionMismatch:
            'נתוני התחזית אינם תואמים לרשימת המשתתפים הפעילים. נסה שוב לאחר עדכון הנתונים.',
          missingWeekend:
            'פורמט סוף השבוע של המרוץ הבא אינו זמין. נסה שוב לאחר עדכון נתוני המרוץ.',
          title: 'תרחישי הקבוצה הטובה ביותר',
          subtitle:
            "הקבוצה המובילה לכל משקל ולכל צ'יפ. 🟢/🟡 מציינים שיפור לעומת ללא צ'יפ באותה שורה.",
          pointsPerMillion: "נק' / $M",
          scenario: 'תרחיש',
          points: "נק'",
          priceChange: 'שינוי מחיר',
        }
      : {
          noTeams: "You don't have any tracked teams yet.",
          missingCache:
            'Missing cached data for this team. Upload current team data via the Telegram bot first.',
          unknownTeam: "Couldn't find a matching team.",
          ambiguous: 'Multiple tracked teams — specify which one.',
          projectionMismatch:
            'Projection data does not match the active player list. Try after the next data refresh.',
          missingWeekend:
            'The next-race weekend format is unavailable. Try after race data refreshes.',
          title: 'Best Team Scenarios',
          subtitle:
            'Top team per ppm preset × chip combination. 🟢/🟡 indicate chip lift vs. no-chip baseline of the same row.',
          pointsPerMillion: 'pts / $M',
          scenario: 'Scenario',
          points: 'Pts',
          priceChange: 'Δ price',
        };

  if (result.status === 'no_teams') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-warning-text)' }}
      >
        {labels.noTeams}
      </div>
    );
  }

  if (result.status === 'missing_cache') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-warning-text)' }}
      >
        {labels.missingCache}
      </div>
    );
  }

  if (result.status === 'unknown_team') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.unknownTeam}
      </div>
    );
  }

  if (result.status === 'ambiguous_team') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-warning-text)' }}
      >
        {labels.ambiguous}
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

  const scenarios = result.scenarios ?? [];
  if (scenarios.length === 0) {
    return null;
  }

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--app-surface-muted)',
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <div
          style={{ fontWeight: 700, fontSize: 14, color: 'var(--app-text)' }}
        >
          📊 {labels.title} — {result.teamName}
        </div>
        <div style={{ color: 'var(--app-subtle)', fontSize: 11, marginTop: 2 }}>
          {labels.subtitle}
        </div>
      </div>

      {scenarios.map((row) => (
        <div
          key={row.ppm}
          style={{
            borderTop: '1px solid var(--app-border)',
            padding: '10px 14px',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--app-text)',
              marginBottom: 6,
            }}
          >
            {scenarioPpmLabel(row, lang)}{' '}
            <span style={{ color: 'var(--app-subtle)', fontWeight: 400 }}>
              ({row.ppm} {labels.pointsPerMillion})
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
              <tr style={{ color: 'var(--app-subtle)', textAlign: 'start' }}>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>
                  {labels.scenario}
                </th>
                <th
                  style={{
                    padding: '4px 8px',
                    textAlign: 'end',
                    fontWeight: 500,
                  }}
                >
                  {labels.points}
                </th>
                <th
                  style={{
                    padding: '4px 8px',
                    textAlign: 'end',
                    fontWeight: 500,
                  }}
                >
                  {labels.priceChange}
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
                      background: isBaseline
                        ? 'transparent'
                        : 'var(--app-surface-subtle)',
                      borderTop:
                        idx === 0 ? 'none' : '1px solid var(--app-border)',
                    }}
                  >
                    <td
                      style={{
                        padding: '4px 8px',
                        fontWeight: isBaseline ? 600 : 400,
                        color: 'var(--app-text)',
                      }}
                    >
                      {scenarioChipLabel(cell, lang, isBaseline)}
                      {dot}
                    </td>
                    <td
                      style={{
                        padding: '4px 8px',
                        textAlign: 'end',
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
                        textAlign: 'end',
                        color: 'var(--app-subtle)',
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
        return <ToolLoading kind="scenarios" />;
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
