import { CopilotKit } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
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

const RUNTIME_URL =
  (import.meta.env.VITE_AGENT_API_URL as string | undefined) ??
  'http://localhost:7071/api/agent/copilotkit';

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

export default function App() {
  return (
    <div className="app-shell">
      <h1 className="app-header">F1 Fantasy Agent</h1>
      <p className="app-subheader">
        Ask about upcoming races or your best teams. The Telegram bot is unaffected.
      </p>
      <CopilotKit runtimeUrl={RUNTIME_URL}>
        <AgentActions />
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
    </div>
  );
}
