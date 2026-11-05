import { useCopilotAction } from '@copilotkit/react-core';
import { safeParse } from './safeParse';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { ToolLoading } from './ToolLoading';

export function LanguageCard({ result }: { result?: { lang?: string } }) {
  const he = result?.lang === 'he';
  return <div dir={he ? 'rtl' : 'ltr'} style={{ padding: 12 }}>
    {he ? 'השפה השמורה: עברית' : 'Saved language: English'}
  </div>;
}

export function useLanguageAction() {
  useCopilotAction({
    name: 'get_language', parameters: [], available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') return <ToolLoading kind="write" />;
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;
      return <LanguageCard result={parsed as { lang?: string } | undefined} />;
    },
  });
}
