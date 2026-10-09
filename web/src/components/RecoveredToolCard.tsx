import { type StoredReadCard, toolPersistencePolicy } from '../lib/chatHistoryStore';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { ActionChoicesCard, isActionChoices, writeActionChoices } from './ActionChoicesCard';
import { WriteConfirmCard, isConfirmationRequired } from './WriteConfirmCard';
import { WriteResultCard, isWriteResult } from './WriteResultCard';
import { InteractiveWriteResult } from './InteractiveWriteResult';
import { SimulationRefreshCard, isSimulationRefreshResult } from './SimulationRefreshCard';
import { ResetUserDataCard, isResetUserDataResult } from './ResetUserDataCard';
import { InteractiveUserTeamsList } from './UserTeamsAction';
import { InteractiveFollowedTeams } from './FollowedTeamsGrid';
import { WorkflowResult } from './workflowRenderers';
import { UiLanguageProvider } from './uiLanguage';

export function RecoveredToolCard({ card }: { card: StoredReadCard }) {
  const result = card.result;
  const lang = result.uiLang === 'he' || result.lang === 'he' ? 'he' : 'en';
  let content;
  if (card.interrupted) content = <p role="status">
    {lang === 'he' ? 'הבקשה הופסקה לפני שהתקבלה תוצאה. ניתן לבקש שוב.' : 'This request was interrupted before a result arrived. You can ask again.'}
  </p>;
  else if (isToolErrorResult(result)) content = <ToolErrorFallback result={result} />;
  else if (isConfirmationRequired(result)) content = <WriteConfirmCard
    result={result} directConfirm={card.direct} initialDecision={card.decision} />;
  else if (isActionChoices(result)) content = <ActionChoicesCard result={result} />;
  else if (toolPersistencePolicy(card.tool) === 'write') {
    const choices = writeActionChoices(result, card.args);
    if (choices) content = <ActionChoicesCard result={choices} />;
    else if (isSimulationRefreshResult(result)) content = <SimulationRefreshCard result={result} />;
    else if (isResetUserDataResult(result)) content = <ResetUserDataCard result={result} />;
    else if (isWriteResult(result)) content = <InteractiveWriteResult historical result={result} />;
    else content = <WriteResultCard historical result={{
      status: 'not_found', tool: card.tool, uiLang: result.uiLang as string | undefined,
      summary: (result.summary || result.message || 'Action complete.') as string,
    }} />;
  } else if (card.tool === 'list_user_teams') content = <InteractiveUserTeamsList result={result} />;
  else if (card.tool === 'list_followed_teams') content = <InteractiveFollowedTeams result={result} />;
  else if (toolPersistencePolicy(card.tool) === 'workflow') content = <p role="status">
    {(result.summary || result.message || (result.lang === 'he' ? 'לא נמצא תהליך פעיל.' : 'No active workflow found.')) as string}
  </p>;
  else content = <WorkflowResult tool={card.tool} result={result} />;
  // A historical receipt must not change today's language preference. Native
  // read cards still use their original lang; clicks go through fresh auth.
  return <UiLanguageProvider initialLanguage={lang}>
    {content}
  </UiLanguageProvider>;
}
