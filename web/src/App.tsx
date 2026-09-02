import { CopilotKit } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useLayoutEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { useAuthFetchInterceptor } from './auth/useAuthFetchInterceptor';
import { AccessVerifier } from './auth/AccessVerifier';
import { LoginScreen } from './components/LoginScreen';
import { SignedInBadge } from './components/SignedInBadge';
import { ThemeToggle } from './components/ThemeToggle';
import { UiLanguageProvider } from './components/uiLanguage';
import { verifyAccess } from './auth/whoami';
import { setHistoryScope } from './lib/chatHistoryStore';
import { useNextRacesAction } from './components/NextRacesTable';
import { useBestTeamsAction } from './components/BestTeamsTable';
import { useBestTeamScenariosAction } from './components/BestTeamScenariosMatrix';
import { useUserTeamsAction } from './components/UserTeamsAction';
import { useFollowedTeamsAction } from './components/FollowedTeamsGrid';
import { useLeaderboardAction } from './components/LeaderboardTable';
import { useLeagueChangesAction } from './components/LeagueChangesCard';
import { useLeagueGraphAction } from './components/LeagueGraphCard';
import { useRaceSummaryAction } from './components/RaceSummaryCard';
import { useWhatsNewAction } from './components/WhatsNewCard';
import { useSimulationStatusAction } from './components/SimulationStatusCard';
import { useDataStatusAction } from './components/DataStatusCard';
import { useRaceInfoAction } from './components/RaceInfoCard';
import { useWeatherForecastAction } from './components/WeatherForecast';
import { useDeadlineCountdownAction } from './components/DeadlineCountdown';
import { useCurrentTeamAction } from './components/CurrentTeamCard';
import { useLiveScoreBreakdownAction } from './components/LiveScoreBreakdown';
import { useLiveScoreLeaderboardAction } from './components/LiveScoreLeaderboard';
import { useUserLeaguesAction } from './components/UserLeaguesAction';
import { useLeagueTeamsAction } from './components/LeagueTeamsAction';
import { useAgentGuideAction } from './components/AgentGuideCard';
import { useWriteAction } from './components/registerWriteAction';
import { WriteDecisionProvider } from './components/WriteDecisionContext';
import { HistoryRestorer } from './components/HistoryRestorer';
import { ClearHistoryButton } from './components/ClearHistoryButton';
import { RtlChatSupport } from './components/RtlChatSupport';
import {
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  type ThemeMode,
} from './theme';

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
  useLeagueChangesAction();
  useLeagueGraphAction();
  useRaceSummaryAction();
  useWhatsNewAction();
  useSimulationStatusAction();
  useDataStatusAction();
  useBestTeamsAction();
  useBestTeamScenariosAction();
  useRaceInfoAction();
  useWeatherForecastAction();
  useDeadlineCountdownAction();
  useCurrentTeamAction();
  useLiveScoreBreakdownAction();
  useLiveScoreLeaderboardAction();
  useUserLeaguesAction();
  useLeagueTeamsAction();
  useAgentGuideAction();
  // Write tools register through the shared confirmation/result factory.
  useWriteAction({
    name: 'set_language',
    description: 'Change the signed-in user language to English or Hebrew.',
    loadingLabel: 'Preparing language change…',
  });
  useWriteAction({
    name: 'select_team',
    description: 'Change the signed-in user active fantasy team.',
    loadingLabel: 'Preparing team selection…',
  });
  useWriteAction({
    name: 'set_best_team_ranking',
    description:
      'Change how budget growth influences best-team ranking for one team.',
    loadingLabel: 'Preparing ranking change…',
  });
  useWriteAction({
    name: 'activate_chip',
    description: 'Activate or reset a chip for one fantasy team.',
    loadingLabel: 'Preparing chip change…',
  });
  useWriteAction({
    name: 'follow_league',
    description: 'Follow an F1 Fantasy league by its share code.',
    loadingLabel: 'Checking league…',
  });
  useWriteAction({
    name: 'unfollow_league',
    description: 'Stop following one private F1 Fantasy league.',
    loadingLabel: 'Checking followed league…',
  });
  useWriteAction({
    name: 'follow_team',
    description: 'Add or remove one followed team from a private league.',
    loadingLabel: 'Checking league team…',
  });
  useWriteAction({
    name: 'report_bug',
    description: 'Send a bug report or feedback to the administrators.',
    loadingLabel: 'Preparing bug report…',
  });
  useWriteAction({
    name: 'confirm_write',
    description:
      'Commit a previously proposed write action by its writeNonce.',
    loadingLabel: 'Applying change…',
  });
  return null;
}

function AuthedAgent({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const { session } = useAuth();
  useAuthFetchInterceptor(RUNTIME_URL);

  if (!session) {
    // Detach any previous user's history scope before the login screen
    // renders. Defensive — `signOut()` clearing the session triggers
    // this branch even if a different user later signs in.
    setHistoryScope(null);
    return <LoginScreen theme={theme} onToggleTheme={onToggleTheme} />;
  }

  return (
    <AccessVerifier runtimeUrl={RUNTIME_URL}>
      <VerifiedAgentChat theme={theme} onToggleTheme={onToggleTheme} />
    </AccessVerifier>
  );
}

function VerifiedAgentChat({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const { session } = useAuth();

  // Bind the chat-history scope SYNCHRONOUSLY during render — before
  // any descendant effect runs. React runs child effects BEFORE
  // parent effects on a commit, so binding the scope in a parent
  // `useEffect` would let `<HistoryRestorer />`'s very first read
  // observe an unbound or stale scope. Calling `setHistoryScope`
  // during render is safe because the assignment is idempotent for
  // the same session — strict-mode double invocation produces the
  // same value.
  setHistoryScope(session ? session.claims.sub : null);

  if (!session) {
    // Defensive guard — AccessVerifier should not render us without a
    // session, but if signOut() races a re-render we'd rather show
    // nothing than mount the chat tree without an identity.
    return null;
  }

  return (
    <WriteDecisionProvider
      runtimeUrl={RUNTIME_URL}
      idToken={session.idToken}
    >
      <CopilotKit
        runtimeUrl={RUNTIME_URL}
        headers={() => ({ Authorization: `Bearer ${session.idToken}` })}
      >
        <HistoryRestorer />
        <RtlChatSupport />
        <AgentActions />
        <div className="app-titlebar">
          <div>
            <h1 className="app-header">F1 Fantasy Agent</h1>
            <p className="app-subheader">
              Ask about upcoming races or your best teams. The Telegram bot is
              unaffected.
            </p>
          </div>
          <div className="app-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <SignedInBadge />
            <ClearHistoryButton />
          </div>
        </div>
        <div className="chat-wrapper">
          <CopilotChat
            instructions="You are an assistant for an F1 Fantasy player. Use the registered tools to answer questions; the user will see rich UI components automatically when you call them. Match the language of the user's latest message: answer Hebrew questions in Hebrew and English questions in English, unless the user explicitly asks for a specific response language."
            labels={{
              title: 'F1 Fantasy Agent',
              initial: 'Hi! Ask what I can do to get a personalized guide.',
            }}
          />
        </div>
      </CopilotKit>
    </WriteDecisionProvider>
  );
}

// When VITE_GOOGLE_CLIENT_ID is unset (local dev or PR-preview build),
// we render the chat directly without any auth gate — backend bypasses
// auth in that mode too (when GOOGLE_CLIENT_ID is unset on the
// Function App). This keeps `npm run dev` frictionless.
export function UnauthedAgent({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [languageState, setLanguageState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; lang: 'en' | 'he' }
    | { kind: 'unavailable' }
  >({ kind: 'loading' });
  const [languageRetry, setLanguageRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLanguageState({ kind: 'loading' });
    verifyAccess(null, RUNTIME_URL).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        setLanguageState({
          kind: 'ready',
          lang: result.lang === 'he' ? 'he' : 'en',
        });
      } else {
        setLanguageState({ kind: 'unavailable' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [languageRetry]);

  if (languageState.kind === 'loading') {
    return (
      <div
        aria-label="Loading account preferences"
        style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}
      >
        …
      </div>
    );
  }

  if (languageState.kind === 'unavailable') {
    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'grid',
          placeItems: 'center',
          gap: 12,
        }}
      >
        <span>Unable to load language / לא ניתן לטעון את השפה</span>
        <button
          type="button"
          onClick={() => setLanguageRetry((value) => value + 1)}
        >
          Retry / נסה שוב
        </button>
      </div>
    );
  }

  return (
    <UiLanguageProvider initialLanguage={languageState.lang}>
      <WriteDecisionProvider runtimeUrl={RUNTIME_URL}>
        <CopilotKit runtimeUrl={RUNTIME_URL}>
          <HistoryRestorer />
          <RtlChatSupport />
          <AgentActions />
          <div className="app-titlebar">
            <div>
              <h1 className="app-header">F1 Fantasy Agent</h1>
              <p className="app-subheader">
                Ask about upcoming races or your best teams. The Telegram bot
                is unaffected.
              </p>
            </div>
            <div className="app-actions">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <ClearHistoryButton />
            </div>
          </div>
          <div className="chat-wrapper">
            <CopilotChat
              instructions="You are an assistant for an F1 Fantasy player. Use the registered tools to answer questions; the user will see rich UI components automatically when you call them. Match the language of the user's latest message: answer Hebrew questions in Hebrew and English questions in English, unless the user explicitly asks for a specific response language."
              labels={{
                title: 'F1 Fantasy Agent',
                initial: 'Hi! Ask what I can do to get a personalized guide.',
              }}
            />
          </div>
        </CopilotKit>
      </WriteDecisionProvider>
    </UiLanguageProvider>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme());

  useLayoutEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const onToggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="app-shell">
        <UnauthedAgent theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <div className="app-shell">
          <AuthedAgent theme={theme} onToggleTheme={onToggleTheme} />
        </div>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
