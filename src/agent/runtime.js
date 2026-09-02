// Agent runtime — builds a CopilotKit v2 `BuiltInAgent` over our tools
// and exposes a Node HTTP handler that accepts a Web Request and
// returns a Web Response.
//
// CopilotKit v2 architecture: the LLM call + tool execution loop lives
// inside an *agent* (here `BuiltInAgent`). The runtime delegates each
// run to that agent. Bare `actions` on `CopilotRuntime` are a v1
// concept — v2 ignores them, so passing tools that way silently makes
// the model hallucinate tool calls (it sees the tool name in the
// system prompt but no result is produced). We register a single
// "default" agent that owns the tools.

const {
  CopilotRuntime,
  BuiltInAgent,
  createCopilotRuntimeHandler,
} = require('@copilotkit/runtime/v2');
const { createAzure } = require('@ai-sdk/azure');
const { wrapLanguageModel } = require('ai');

const { tools } = require('./tools');
const { getSystemPrompt } = require('./systemPrompt');
const { getNotifierBot } = require('./notifierBot');
const { createTokenUsageMiddleware } = require('./tokenUsageMiddleware');

const COPILOTKIT_ENDPOINT = '/api/agent/copilotkit';
const AZURE_OPENAI_API_VERSION = '2024-04-01-preview';
const AGENT_MAX_STEPS = 5;

let cachedHandler = null;

function readEnv() {
  const {
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY,
    AZURE_OPEN_AI_MODEL,
  } = process.env;

  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPEN_AI_MODEL) {
    throw new Error(
      'Missing Azure OpenAI configuration (AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPEN_AI_MODEL).',
    );
  }

  return {
    endpoint: AZURE_OPENAI_ENDPOINT.replace(/\/+$/, ''),
    apiKey: AZURE_OPENAI_API_KEY,
    model: AZURE_OPEN_AI_MODEL,
  };
}

function buildAzureLanguageModel({ endpoint, apiKey, model }) {
  // Use the deployment-based URL pattern (`{baseURL}/deployments/{model}/...`)
  // because that's what every existing Azure OpenAI deployment supports
  // regardless of whether the endpoint host is `*.openai.azure.com` or
  // `*.services.ai.azure.com` (Azure AI Foundry). `azure.chat(...)` returns
  // a Chat Completions language model (not the new `/responses` API).
  const azure = createAzure({
    baseURL: `${endpoint}/openai`,
    apiKey,
    apiVersion: AZURE_OPENAI_API_VERSION,
    useDeploymentBasedUrls: true,
  });

  return azure.chat(model);
}

function buildAgent(cfg) {
  const rawModel = buildAzureLanguageModel(cfg);
  // Wrap the Azure model with our token-usage middleware so every LLM step
  // emits a log line into stdout + the Telegram log channel. The middleware
  // is purely observational — it never mutates the stream.
  const model = wrapLanguageModel({
    model: rawModel,
    middleware: createTokenUsageMiddleware({ bot: getNotifierBot() }),
  });

  return new BuiltInAgent({
    model,
    prompt: getSystemPrompt(),
    tools,
    // Write-confirmation nonces are injected as hidden AG-UI developer
    // messages. CopilotKit renders only user/assistant roles, while this flag
    // forwards developer content to the model as a system message so it can
    // call confirm_write.
    forwardDeveloperMessages: true,
    // Allow the model to call a tool, see the result, and produce a
    // final assistant message in one run. Without this it stops after
    // emitting the tool call and never synthesises a reply.
    maxSteps: AGENT_MAX_STEPS,
    // CopilotKit's `useLazyToolRenderer` only renders `toolCalls[0]` of
    // an assistant message (see node_modules/.../use-lazy-tool-renderer.tsx
    // line 15). When Azure OpenAI emits PARALLEL tool calls in one
    // message (default behaviour), only the first tool's React render
    // hook fires — the rest are silently dropped from the UI. Forcing
    // sequential tool calls makes each tool call land in its own
    // assistant message, so each gets its own rich UI render. The current
    // Chat Completions deployment accepts `medium` reasoning effort.
    providerOptions: {
      openai: {
        parallelToolCalls: false,
        reasoningEffort: 'medium',
      },
    },
  });
}

function getCopilotRuntimeHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const cfg = readEnv();
  const agent = buildAgent(cfg);
  const runtime = new CopilotRuntime({
    agents: { default: agent },
  });

  // Single-route mode keeps the protocol identical to the legacy
  // endpoint our React app speaks: one POST to {basePath} carrying a
  // JSON envelope, no per-route URLs.
  cachedHandler = createCopilotRuntimeHandler({
    runtime,
    basePath: COPILOTKIT_ENDPOINT,
    mode: 'single-route',
    cors: true,
  });

  return cachedHandler;
}

module.exports = {
  getCopilotRuntimeHandler,
  COPILOTKIT_ENDPOINT,
  getSystemPrompt,
  buildAgent,
};
