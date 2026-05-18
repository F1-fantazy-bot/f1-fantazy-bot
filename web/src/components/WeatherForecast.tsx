import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type Forecast = {
  temperature?: number;
  humidity?: number;
  cloudCover?: number;
  precipitation?: number;
  precipitation_mm?: number;
  wind?: number;
};

type SessionForecast = {
  key: string;
  label: string;
  startsAt: string;
  hours: string[];
  forecasts: Forecast[];
};

type WeatherResult = {
  status?: 'ok' | 'unavailable';
  raceName?: string;
  circuitName?: string;
  location?: { locality?: string; country?: string };
  isSprintWeekend?: boolean;
  sessions?: SessionForecast[];
  fetchFailed?: boolean;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSessionStart(iso: string): string {
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

function rainEmoji(precipitation?: number): string {
  if (precipitation === undefined) return '';
  if (precipitation >= 70) return '🌧';
  if (precipitation >= 30) return '🌦';
  if (precipitation >= 5) return '⛅';
  return '☀️';
}

function WeatherForecast({ result }: { result?: WeatherResult }) {
  if (!result || result.status === 'unavailable') {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        Weather forecast isn't available right now.
      </div>
    );
  }

  const sessions = result.sessions ?? [];

  if (sessions.length === 0) {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        No upcoming sessions to forecast.
      </div>
    );
  }

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
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Weather forecast — {result.raceName ?? 'Next race'}
        </div>
        {result.location ? (
          <div style={{ color: '#5a6471', marginTop: 2 }}>
            {result.location.locality}, {result.location.country}
            {result.circuitName ? ` · ${result.circuitName}` : ''}
          </div>
        ) : null}
      </div>

      {sessions.map((session) => (
        <div
          key={session.key}
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #f0f2f7',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 6,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'baseline',
            }}
          >
            <span>{session.label}</span>
            <span style={{ fontSize: 12, color: '#5a6471', fontWeight: 500 }}>
              {formatSessionStart(session.startsAt)}
            </span>
          </div>
          {session.hours.length === 0 ? (
            <div style={{ color: '#888' }}>(already underway)</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${session.hours.length}, 1fr)`,
                gap: 8,
              }}
            >
              {session.hours.map((hour, idx) => {
                const f = session.forecasts[idx] || {};
                return (
                  <div
                    key={hour}
                    style={{
                      border: '1px solid #eef0f5',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background: '#fafbfd',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: '#5a6471',
                        marginBottom: 4,
                      }}
                    >
                      {formatTime(hour)}
                    </div>
                    <div style={{ fontSize: 18, marginBottom: 2 }}>
                      {rainEmoji(f.precipitation)}
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      {f.temperature ?? '—'}°C
                    </div>
                    <div style={{ color: '#5a6471', fontSize: 12 }}>
                      🌧 {f.precipitation ?? 0}%
                      {typeof f.precipitation_mm === 'number'
                        ? ` (${f.precipitation_mm}mm)`
                        : ''}
                    </div>
                    <div style={{ color: '#5a6471', fontSize: 12 }}>
                      💨 {f.wind ?? '—'} km/h
                    </div>
                    <div style={{ color: '#5a6471', fontSize: 12 }}>
                      💧 {f.humidity ?? '—'}% · ☁️ {f.cloudCover ?? '—'}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function useWeatherForecastAction() {
  useCopilotAction({
    name: 'get_race_weather',
    description:
      'Per-session hourly weather forecast (up to 3 hours per session) for the next F1 race weekend.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: '#666' }}>
            Fetching weather forecast…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return <WeatherForecast result={parsed as WeatherResult | undefined} />;
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
