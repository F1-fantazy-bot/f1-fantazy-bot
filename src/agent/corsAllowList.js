// CORS allowlist matcher for the agent webhook.
//
// Why this exists: the agent runs on Azure Function Apps where
// `siteConfig.cors.allowedOrigins` is set per-host and only supports
// exact origins (no wildcards/regex). Azure Static Web App preview
// environments have unpredictable hostnames like
// `https://<branch>.<token>.westeurope.<n>.azurestaticapps.net`,
// so we can't enumerate them in the function-app CORS config.
//
// The fix is to disable Azure's built-in CORS layer
// (siteConfig.cors.allowedOrigins = [] in the ARM template) and have
// the function handle CORS itself, configured via env vars:
//
//   AGENT_CORS_ALLOWED_ORIGINS         — comma-separated EXACT origins
//                                         (e.g. "https://prod.example.com,https://other.example.com")
//                                         The literal "*" matches any origin.
//   AGENT_CORS_PREVIEW_ORIGIN_PATTERN  — optional regex matched against
//                                         the Origin header (e.g. SWA
//                                         preview hostname pattern).
//
// Local-dev fallback: when BOTH env vars are unset/empty, returns "*"
// for any request — preserves the old hardcoded behaviour so `npm run
// dev` keeps working without any extra setup.

function parseAllowList(envValue) {
  if (envValue === undefined || envValue === null || envValue === '') {
    return [];
  }

  return String(envValue)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function compilePattern(envValue) {
  if (envValue === undefined || envValue === null || envValue === '') {
    return null;
  }
  try {
    return new RegExp(envValue);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      'Invalid AGENT_CORS_PREVIEW_ORIGIN_PATTERN — ignoring:',
      err && err.message
    );

    return null;
  }
}

function resolveAllowedOrigin(originHeader, options = {}) {
  const allowList = options.allowList || [];
  const previewPattern = options.previewPattern || null;

  const noConfig = allowList.length === 0 && !previewPattern;
  if (noConfig) {
    return '*';
  }

  if (!originHeader) {
    return null;
  }

  if (allowList.includes('*')) {
    return '*';
  }

  if (allowList.includes(originHeader)) {
    return originHeader;
  }

  if (previewPattern && previewPattern.test(originHeader)) {
    return originHeader;
  }

  return null;
}

const STATIC_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-copilotcloud-public-api-key',
  'Access-Control-Max-Age': '86400',
};

function buildCorsHeadersFromEnv(originHeader, env) {
  const source = env || process.env;
  const allowList = parseAllowList(source.AGENT_CORS_ALLOWED_ORIGINS);
  const previewPattern = compilePattern(source.AGENT_CORS_PREVIEW_ORIGIN_PATTERN);
  const allowedOrigin = resolveAllowedOrigin(originHeader, {
    allowList,
    previewPattern,
  });

  const headers = { ...STATIC_CORS_HEADERS };
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    if (allowedOrigin !== '*') {
      // Echoing a specific origin → caches must vary on Origin.
      headers['Vary'] = 'Origin';
    }
  }

  return headers;
}

module.exports = {
  parseAllowList,
  compilePattern,
  resolveAllowedOrigin,
  buildCorsHeadersFromEnv,
  STATIC_CORS_HEADERS,
};
