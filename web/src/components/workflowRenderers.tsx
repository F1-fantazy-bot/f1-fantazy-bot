import { RaceInfoCard } from './RaceInfoCard';
import { BestTeamChangesCard, workflowChangesTarget } from './BestTeamChangesCard';
import { InteractiveUserLeagues } from './UserLeaguesAction';
import { InteractiveLeagueTeams } from './LeagueTeamsAction';
import { type ComponentType } from 'react';
import { BestTeamsTable } from './BestTeamsTable';
import { BestTeamScenariosMatrix } from './BestTeamScenariosMatrix';
import { CurrentTeamCard } from './CurrentTeamCard';
import { LeaderboardTable } from './LeaderboardTable';
import { NextRacesTable } from './NextRacesTable';
import { UserTeamsList } from './UserTeamsList';
import { FollowedTeamsGrid } from './FollowedTeamsGrid';
import { WeatherForecast } from './WeatherForecast';
import { DeadlineCountdown } from './DeadlineCountdown';
import { LiveScoreBreakdown } from './LiveScoreBreakdown';
import { LiveScoreLeaderboard } from './LiveScoreLeaderboard';
import { LeagueChangesCard } from './LeagueChangesCard';
import { LeagueGraphCard } from './LeagueGraphCard';
import { RaceSummaryCard } from './RaceSummaryCard';
import { WhatsNewCard } from './WhatsNewCard';
import { SimulationStatusCard } from './SimulationStatusCard';
import { DataStatusCard } from './DataStatusCard';
import { AgentGuideCard } from './AgentGuideCard';
import {
  AdminVersionCard,
  BillingStatsCard,
  BotUsersCard,
  WebUsersCard,
  BotfatherSetupCard,
} from './AdminReadCards';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { WriteResultCard, isWriteResult } from './WriteResultCard';
import { ActionChoicesCard, isActionChoices } from './ActionChoicesCard';

function renderer<T>(Component: ComponentType<{ result?: T }>) {
  return (result: unknown) => <Component result={result as T} />;
}
export const workflowRenderers = {
  get_next_race_info: renderer(RaceInfoCard),
  get_best_team_changes: renderer(BestTeamChangesCard),
  list_user_leagues: renderer(InteractiveUserLeagues),
  list_league_teams: renderer(InteractiveLeagueTeams),
  get_best_teams: renderer(BestTeamsTable),
  get_best_team_scenarios: renderer(BestTeamScenariosMatrix),
  get_current_team: renderer(CurrentTeamCard),
  get_leaderboard: renderer(LeaderboardTable),
  get_next_races: renderer(NextRacesTable),
  list_user_teams: renderer(UserTeamsList),
  list_followed_teams: renderer(FollowedTeamsGrid),
  get_race_weather: renderer(WeatherForecast),
  get_deadline: renderer(DeadlineCountdown),
  get_live_score_for_team: renderer(LiveScoreBreakdown),
  get_live_score_leaderboard: renderer(LiveScoreLeaderboard),
  get_league_changes: renderer(LeagueChangesCard),
  get_league_graph: renderer(LeagueGraphCard),
  get_race_summary: renderer(RaceSummaryCard),
  get_whats_new: renderer(WhatsNewCard),
  get_simulation_status: renderer(SimulationStatusCard),
  get_data_status: renderer(DataStatusCard),
  get_agent_guide: renderer(AgentGuideCard),
  get_admin_version: renderer(AdminVersionCard),
  get_billing_stats: renderer(BillingStatsCard),
  list_bot_users: renderer(BotUsersCard),
  list_web_users: renderer(WebUsersCard),
  get_botfather_setup: renderer(BotfatherSetupCard),
};
export function WorkflowResult({
  tool,
  result,
}: {
  tool: string;
  result: unknown;
}) {
  if (isToolErrorResult(result)) return <ToolErrorFallback result={result} />;
  if (isActionChoices(result)) return <ActionChoicesCard result={result} />;
  const render = workflowRenderers[tool as keyof typeof workflowRenderers];
  if (tool === 'get_best_teams') {
    const calculationId = (result as { calculationId?: string } | undefined)?.calculationId;
    return <>{render(result)}{calculationId && <div id={workflowChangesTarget(calculationId)} aria-live="polite" />}</>;
  }
  if (render) return render(result);
  if (isWriteResult(result)) return <WriteResultCard result={result} />;
  return (
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}
