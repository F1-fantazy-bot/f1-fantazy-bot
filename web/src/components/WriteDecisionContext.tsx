import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

export type WriteDecision = 'approve' | 'cancel';

export type WriteDecisionResponse = {
  status: 'approved' | 'cancelled' | 'not_found' | 'invalid_input';
  writeNonce?: string;
  message?: string;
};

type WriteDecisionContextValue = {
  decide: (
    writeNonce: string,
    decision: WriteDecision,
  ) => Promise<WriteDecisionResponse>;
};

type RequestWriteDecisionOptions = {
  runtimeUrl: string;
  idToken?: string;
  writeNonce: string;
  decision: WriteDecision;
  fetchImpl?: typeof window.fetch;
};

const WriteDecisionContext = createContext<WriteDecisionContextValue | null>(
  null,
);

export function buildWriteDecisionUrl(runtimeUrl: string): string {
  const url = new URL(runtimeUrl, window.location.origin);
  const suffix = '/copilotkit';
  url.pathname = url.pathname.endsWith(suffix)
    ? `${url.pathname.slice(0, -suffix.length)}/write-decision`
    : `${url.pathname.replace(/\/+$/, '')}/write-decision`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function requestWriteDecision({
  runtimeUrl,
  idToken,
  writeNonce,
  decision,
  fetchImpl = window.fetch.bind(window),
}: RequestWriteDecisionOptions): Promise<WriteDecisionResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetchImpl(buildWriteDecisionUrl(runtimeUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ writeNonce, decision }),
  });

  let body: WriteDecisionResponse | null = null;
  try {
    body = (await response.json()) as WriteDecisionResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body) {
    throw new Error(
      body?.message || 'Unable to record your decision. Please try again.',
    );
  }

  return body;
}

export function WriteDecisionProvider({
  runtimeUrl,
  idToken,
  children,
}: {
  runtimeUrl: string;
  idToken?: string;
  children: ReactNode;
}) {
  const value = useMemo<WriteDecisionContextValue>(
    () => ({
      decide: (writeNonce, decision) =>
        requestWriteDecision({
          runtimeUrl,
          idToken,
          writeNonce,
          decision,
        }),
    }),
    [runtimeUrl, idToken],
  );

  return (
    <WriteDecisionContext.Provider value={value}>
      {children}
    </WriteDecisionContext.Provider>
  );
}

export function useWriteDecision(): WriteDecisionContextValue {
  const value = useContext(WriteDecisionContext);
  if (!value) {
    throw new Error(
      'useWriteDecision must be used inside <WriteDecisionProvider>',
    );
  }
  return value;
}
