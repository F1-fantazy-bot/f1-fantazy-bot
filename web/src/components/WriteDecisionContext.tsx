import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

export type WriteDecision =
  | 'approve'
  | 'approve_and_confirm'
  | 'cancel'
  | 'revoke';

export type WriteDecisionResponse = {
  status: string;
  tool?: string;
  writeNonce?: string;
  summary?: string;
  uiLang?: string;
  message?: string;
};

export type WriteProposalResponse = {
  status?: string;
  tool?: string;
  writeNonce?: string;
  summary?: string;
  args?: Record<string, unknown>;
  uiLang?: string;
  message?: string;
};

type WriteDecisionContextValue = {
  decide: (
    writeNonce: string,
    decision: WriteDecision,
  ) => Promise<WriteDecisionResponse>;
  propose: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<WriteProposalResponse>;
};

type RequestWriteDecisionOptions = {
  runtimeUrl: string;
  idToken?: string;
  writeNonce: string;
  decision: WriteDecision;
  fetchImpl?: typeof window.fetch;
};

type RequestWriteProposalOptions = {
  runtimeUrl: string;
  idToken?: string;
  tool: string;
  args: Record<string, unknown>;
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

export function buildWriteProposalUrl(runtimeUrl: string): string {
  const url = new URL(runtimeUrl, window.location.origin);
  const suffix = '/copilotkit';
  url.pathname = url.pathname.endsWith(suffix)
    ? `${url.pathname.slice(0, -suffix.length)}/write-proposal`
    : `${url.pathname.replace(/\/+$/, '')}/write-proposal`;
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

export async function requestWriteProposal({
  runtimeUrl,
  idToken,
  tool,
  args,
  fetchImpl = window.fetch.bind(window),
}: RequestWriteProposalOptions): Promise<WriteProposalResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetchImpl(buildWriteProposalUrl(runtimeUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, args }),
  });

  let body: WriteProposalResponse | null = null;
  try {
    body = (await response.json()) as WriteProposalResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body) {
    throw new Error(
      body?.message || 'Unable to prepare this change. Please try again.',
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
      propose: (tool, args) =>
        requestWriteProposal({
          runtimeUrl,
          idToken,
          tool,
          args,
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
