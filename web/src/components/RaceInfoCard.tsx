import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type Sessions = {
  qualifying?: string;
  race?: string;
  sprintQualifying?: string;
  sprint?: string;
};

type WeatherEntry = {
  temperature?: number;
  precipitation?: number;
  wind?: number;
};

type HistoricalRow = {
  season?: number | string;
  winner?: string;
  constructor?: string;
  polePosition?: string;
  poleConstructor?: string;
  secondPlaceDriver?: string;
  secondPlaceConstructor?: string;
  thirdPlaceDriver?: string;
  thirdPlaceConstructor?: string;
  carsFinished?: number;
  overtakes?: number;
  safetyCars?: number;
  redFlags?: number;
};

type TrackHistory = { lang?: string; text?: string };

type RaceInfoResult = {
  status?: 'ok' | 'unavailable';
  raceName?: string;
  circuitName?: string;
  circuitImageUrl?: string;
  location?: { locality?: string; country?: string };
  weekendFormat?: string;
  isSprintWeekend?: boolean;
  sessions?: Sessions;
  historicalRaceStats?: HistoricalRow[];
  trackHistory?: TrackHistory[];
  weather?: {
    qualifyingWeather?: WeatherEntry;
    raceWeather?: WeatherEntry;
    sprintQualifyingWeather?: WeatherEntry;
    sprintWeather?: WeatherEntry;
    fetchFailed?: boolean;
  };
};

function formatIso(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function pickTrackHistory(entries?: TrackHistory[]): string | null {
  if (!entries || entries.length === 0) return null;
  const en = entries.find((h) => h.lang === 'en');
  return (en ?? entries[0]).text ?? null;
}

function WeatherChip({
  label,
  entry,
}: {
  label: string;
  entry?: WeatherEntry;
}) {
  if (!entry || entry.temperature === undefined) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 999,
        background: 'var(--app-primary-surface)',
        color: 'var(--app-primary-strong)',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span>{label}</span>
      <span style={{ color: 'var(--app-primary)' }}>·</span>
      <span>🌡 {entry.temperature}°C</span>
      <span>🌧 {entry.precipitation ?? 0}%</span>
      <span>💨 {entry.wind ?? 0} km/h</span>
    </span>
  );
}

function RaceInfoCard({ result }: { result?: RaceInfoResult }) {
  if (!result || result.status === 'unavailable') {
    return (
      <div style={{ padding: 12, color: 'var(--app-muted)' }}>
        Race information isn't available right now. Try again in a moment.
      </div>
    );
  }

  const trackText = pickTrackHistory(result.trackHistory);
  const stats = (result.historicalRaceStats || [])
    .slice()
    .sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0));
  const isSprint = result.isSprintWeekend;
  const sessions = result.sessions || {};
  const weather = result.weather || {};

  return (
    <div
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
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>{result.raceName}</div>
        <div style={{ color: 'var(--app-muted)', marginTop: 2 }}>
          {result.circuitName}
          {result.location
            ? ` · ${result.location.locality}, ${result.location.country}`
            : ''}
          {result.weekendFormat
            ? ` · ${result.weekendFormat.toUpperCase()} weekend`
            : ''}
        </div>
      </div>

      {result.circuitImageUrl ? (
        <div style={{ padding: '12px 16px 0' }}>
          <img
            src={result.circuitImageUrl}
            alt={`${result.circuitName ?? 'Circuit'} map`}
            style={{
              maxWidth: '100%',
              maxHeight: 260,
              objectFit: 'contain',
              borderRadius: 6,
              border: '1px solid var(--app-border)',
            }}
          />
        </div>
      ) : null}

      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Schedule</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 12px',
          }}
        >
          {isSprint && sessions.sprintQualifying ? (
            <>
              <div style={{ color: 'var(--app-muted)' }}>Sprint Qualifying</div>
              <div>{formatIso(sessions.sprintQualifying)}</div>
            </>
          ) : null}
          {isSprint && sessions.sprint ? (
            <>
              <div style={{ color: 'var(--app-muted)' }}>Sprint</div>
              <div>{formatIso(sessions.sprint)}</div>
            </>
          ) : null}
          <div style={{ color: 'var(--app-muted)' }}>Qualifying</div>
          <div>{formatIso(sessions.qualifying)}</div>
          <div style={{ color: 'var(--app-muted)' }}>Race</div>
          <div>{formatIso(sessions.race)}</div>
        </div>
        {/* TODO: surface FP1/FP2/FP3 once nextRaceInfoCache tracks them. */}
      </div>

      {weather.qualifyingWeather && weather.raceWeather ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Weather forecast
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {isSprint ? (
              <>
                <WeatherChip
                  label="SQ"
                  entry={weather.sprintQualifyingWeather}
                />
                <WeatherChip label="Sprint" entry={weather.sprintWeather} />
              </>
            ) : null}
            <WeatherChip label="Quali" entry={weather.qualifyingWeather} />
            <WeatherChip label="Race" entry={weather.raceWeather} />
          </div>
        </div>
      ) : null}

      {stats.length > 0 ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Historical results
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--app-surface-subtle)',
                  textAlign: 'left',
                }}
              >
                <th style={cellHeader}>Year</th>
                <th style={cellHeader}>Pole</th>
                <th style={cellHeader}>Winner</th>
                <th style={cellHeader}>2nd</th>
                <th style={cellHeader}>3rd</th>
                <th style={{ ...cellHeader, textAlign: 'center' }}>Finished</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr
                  key={String(row.season)}
                  style={{ borderTop: '1px solid var(--app-border)' }}
                >
                  <td style={cellBody}>{row.season ?? '—'}</td>
                  <td style={cellBody}>
                    {row.polePosition ?? '—'}
                    {row.poleConstructor ? (
                      <span style={{ color: 'var(--app-subtle)' }}>
                        {' '}
                        ({row.poleConstructor})
                      </span>
                    ) : null}
                  </td>
                  <td style={cellBody}>
                    {row.winner ?? '—'}
                    {row.constructor ? (
                      <span style={{ color: 'var(--app-subtle)' }}>
                        {' '}
                        ({row.constructor})
                      </span>
                    ) : null}
                  </td>
                  <td style={cellBody}>{row.secondPlaceDriver ?? '—'}</td>
                  <td style={cellBody}>{row.thirdPlaceDriver ?? '—'}</td>
                  <td style={{ ...cellBody, textAlign: 'center' }}>
                    {row.carsFinished ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {trackText ? (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--app-surface-subtle)',
            borderTop: '1px solid var(--app-border)',
            color: 'var(--app-muted)',
            whiteSpace: 'pre-wrap',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 6,
              color: 'var(--app-text)',
            }}
          >
            Track history
          </div>
          {trackText}
        </div>
      ) : null}
    </div>
  );
}

const cellHeader: React.CSSProperties = {
  padding: '6px 10px',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--app-muted)',
  letterSpacing: 0,
};

const cellBody: React.CSSProperties = {
  padding: '6px 10px',
  verticalAlign: 'top',
};

export function useRaceInfoAction() {
  useCopilotAction({
    name: 'get_next_race_info',
    description:
      'Get detailed info on the next F1 race: circuit, location, schedule, weather snapshot, historical stats, and track history.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: 'var(--app-muted)' }}>
            Loading next race info…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return <RaceInfoCard result={parsed as RaceInfoResult | undefined} />;
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
