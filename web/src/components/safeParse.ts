// CopilotKit's `render({ result })` sometimes hands us a JSON-encoded
// string and sometimes the already-parsed object. Every tool-render
// hook needs the same defensive parse, so it lives here once.
export function safeParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
