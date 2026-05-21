import { useEffect } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { useAuthFetchInterceptor } from './auth/useAuthFetchInterceptor';
import { LoginScreen } from './components/LoginScreen';
import { SignedInBadge } from './components/SignedInBadge';
import { setHistoryScope } from './lib/chatHistoryStore';
import { useNextRacesAction } from './components/NextRacesTable';
import { useBestTeamsAction } from './components/BestTeamsTable';
import { useBestTeamScenariosAction } from './components/BestTeamScenariosMatrix';
import { useUserTeamsAction } from './components/UserTeamsList';
import { useFollowedTeamsAction } from './components/FollowedTeamsGrid';
import { useLeaderboardAction } from './components/LeaderboardTable';
import { useRaceInfoAction } from './components/RaceInfoCard';
import { useWeatherForecastAction } from './components/WeatherForecast';
import { useDeadlineCountdownAction } from './components/DeadlineCountdown';
import { useCurrentTeamAction } from './components/CurrentTeamCard';
import { useLiveScoreBreakdownAction } from './components/LiveScoreBreakdown';
import { useLiveScoreLeaderboardAction } from './components/LiveScoreLeaderboard';
import { HistoryRestorer } from './components/HistoryRestorer';
import { ClearHistoryButton } from './components/ClearHistoryButton';

const RUNTIME_URL =
  (import.meta.env.VITE_AGENT_API_URL as string | undefined) ??
  'http://localhost:7071/api/agent/copilotkit';

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

function AgentActions() {
  useNextRacesAction();
  useUserTeamsAction();
  useFollowedTeamsAction();
  useLeaderboardAction();
  useBestTeamsAction();
  useBestTeamScenariosAction();
  useRaceInfoAction();
  useWeatherForecastAction();
  useDeadlineCountdownAction();
  useCurrentTeamAction();
  useLiveScoreBreakdownAction();
  useLiveScoreLeaderboardAction();
  return null;
}

function AuthedAgent() {
  const { session } = useAuth();
  useAuthFetchInterceptor(RUNTIME_URL);

  // Keep the chat-history scope in sync with the active user so two
  // users on the same browser don't see each other's chat. Side-effect
  // is set BEFORE the chat tree renders so the very first HistoryRestorer
  // read targets the right key.
  useEffect(() => {
    setHistoryScope(session ? session.claims.sub : null);
  }, [session]);

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <CopilotKit
      runtimeUrl={RUNTIME_URL}
      headers={() => ({ Authorization: `Bearer ${session.idToken}` })}
    >
      <HistoryRestorer />
      <AgentActions />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div>
          <h1 className="app-header">F1 Fantasy Agent</h1>
          <p className="app-subheader">
            Ask about upcoming races or your best teams. The Telegram bot is unaffected.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SignedInBadge />
          <ClearHistoryButton />
        </div>
      </div>
      <div className="chat-wrapper">
        <CopilotChat
          instructions="You are an assistant for an F1 Fantasy player. Use the registered tools to answer questions; the user will see rich UI components automatically when you call them."
          labels={{
            title: 'F1 Fantasy Agent',
            initial:
              'Hi! Try: "best teams for kilzid3 with Verstappen but no Alonso".',
          }}
        />
      </div>
    </CopilotKit>
  );
}

// When VITE_GOOGLE_CLIENT_ID is unset (local dev or PR-preview build),
// we render the chat directly without any auth gate — backend bypasses
// auth in that mode too (when GOOGLE_CLIENT_ID is unset on the
// Function App). This keeps `npm run dev` frictionless.
function UnauthedAgent() {
  return (
    <CopilotKit runtimeUrl={RUNTIME_URL}>
      <HistoryRestorer />
      <AgentActions />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div>
          <h1 className="app-header">F1 Fantasy Agent</h1>
          <p className="app-subheader">
            Ask about upcoming races or your best teams. The Telegram bot is unaffected.
          </p>
        </div>
        <ClearHistoryButton />
      </div>
      <div className="chat-wrapper">
        <CopilotChat
          instructions="You are an assistant for an F1 Fantasy player. Use the registered tools to answer questions; the user will see rich UI components automatically when you call them."
          labels={{
            title: 'F1 Fantasy Agent',
            initial:
              'Hi! Try: "best teams for kilzid3 with Verstappen but no Alonso".',
          }}
        />
      </div>
    </CopilotKit>
  );
}

export default function App() {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="app-shell">
        <UnauthedAgent />
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <div className="app-shell">
          <AuthedAgent />
        </div>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
