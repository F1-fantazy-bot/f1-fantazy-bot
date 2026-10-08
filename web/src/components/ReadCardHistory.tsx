import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { loadReadCards, READ_CARDS_CHANGED_EVENT, type StoredReadCard } from '../lib/chatHistoryStore';
import { WorkflowResult } from './workflowRenderers';

const ReadCardsContext = createContext<StoredReadCard[]>([]);

export function ReadCardHistoryProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState(loadReadCards);
  const { agent } = useAgent({ agentId: 'default' });
  useEffect(() => {
    const update = () => setCards(loadReadCards());
    window.addEventListener(READ_CARDS_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(READ_CARDS_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  // Keep the native live renderer while its tool result is in the conversation.
  const liveIds = new Set((agent?.messages || [])
    .filter((message) => message.role === 'tool').map((message) => message.toolCallId));
  return <ReadCardsContext.Provider value={cards.filter((card) => !liveIds.has(card.id))}>
    {children}
  </ReadCardsContext.Provider>;
}

export function ReadCardHistory({ promptId }: { promptId?: string }) {
  const cards = useContext(ReadCardsContext);
  return <>{cards.filter((card) => card.promptId === promptId).map((card) => (
    <div key={card.id} data-read-card-id={card.id}>
      <WorkflowResult tool={card.tool} result={card.result} />
    </div>
  ))}</>;
}
