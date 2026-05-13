import { CopilotKit } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { useNextRacesAction } from './components/NextRacesTable';

const RUNTIME_URL =
  (import.meta.env.VITE_AGENT_API_URL as string | undefined) ??
  'http://localhost:7071/api/agent/copilotkit';

function AgentActions() {
  useNextRacesAction();
  return null;
}

export default function App() {
  return (
    <div className="app-shell">
      <h1 className="app-header">F1 Fantasy Agent</h1>
      <p className="app-subheader">
        Ask about upcoming races. The Telegram bot is unaffected.
      </p>
      <CopilotKit runtimeUrl={RUNTIME_URL}>
        <AgentActions />
        <div className="chat-wrapper">
          <CopilotChat
            instructions="You are an assistant for an F1 Fantasy player. Use the registered tools to answer questions about upcoming races; the user will see rich UI components automatically when you call them."
            labels={{
              title: 'F1 Fantasy Agent',
              initial: 'Hi! Ask me about upcoming F1 races.',
            }}
          />
        </div>
      </CopilotKit>
    </div>
  );
}
