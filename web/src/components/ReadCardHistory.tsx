import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { loadReadCards, READ_CARDS_CHANGED_EVENT, type StoredReadCard } from '../lib/chatHistoryStore';
import { RecoveredToolCard } from './RecoveredToolCard';

const ReadCardsContext = createContext<StoredReadCard[]>([]);

export function ReadCardHistoryProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState(loadReadCards);
  // Direct proposals already have native dialogs in this mount. Recover them
  // only after a reload, when that component-local state no longer exists.
  const recoveredDirectIds = useRef(new Set(cards.filter((card) => card.direct).map((card) => card.id)));
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
  const liveIds = new Set((agent?.messages || []).flatMap((message) =>
    message.role === 'tool' ? [message.toolCallId]
      : message.role === 'assistant' ? (message.toolCalls || []).map((call) => call.id) : []));
  return <ReadCardsContext.Provider value={cards.filter((card) => !liveIds.has(card.id)
    && (!card.direct || recoveredDirectIds.current.has(card.id)))}>
    {children}
  </ReadCardsContext.Provider>;
}

export function ReadCardHistory({ promptId }: { promptId?: string }) {
  const cards = useContext(ReadCardsContext);
  return <>{cards.filter((card) => card.promptId === promptId).map((card) => (
    <div key={card.id} data-read-card-id={card.id}>
      <RecoveredToolCard card={card} />
    </div>
  ))}</>;
}
