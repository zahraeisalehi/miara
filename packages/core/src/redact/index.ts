// Redaction for anything that leaves the process: logs, fixtures, LLM evidence packs (CLAUDE.md non-negotiable 4).

const NON_SECRET_ENV_KEYS = new Set(['LLM_PROVIDER', 'BOXAPI_MODEL', 'WEB_PORT']);
const MIN_SECRET_LENGTH = 8;

const CREDENTIAL_KEY =
  /token|secret|password|passwd|api[_-]?key|authorization|cookie|accesskey|secretkey|privatekey/i;
const PII_KEY = /email|phone|mobile|fullname|nationalcode|address|avatar|birth/i;

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER = /Bearer\s+[^\s"',;]+/gi;
// The TLD must be letters, so npm specifiers like `express@4.18.2` survive.
const EMAIL = /[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

export const REDACTED = '[REDACTED]';
export const REDACTED_ENV = '[REDACTED:ENV]';
export const REDACTED_PII = '[REDACTED:PII]';

/** Secret values from a parsed env file, longest first so overlapping values redact fully. */
export function buildSecretSet(env: Record<string, string | undefined>): string[] {
  const values = Object.entries(env)
    .filter(([key]) => !NON_SECRET_ENV_KEYS.has(key))
    .map(([, value]) => value ?? '')
    .filter((value) => value.length >= MIN_SECRET_LENGTH);
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}

export function redactString(input: string, secrets: readonly string[]): string {
  let out = input;
  for (const secret of secrets) {
    out = out.split(secret).join(REDACTED_ENV);
  }
  return out
    .replace(JWT, '[REDACTED:JWT]')
    .replace(BEARER, '[REDACTED:BEARER]')
    .replace(EMAIL, '[REDACTED:EMAIL]')
    .replace(IPV4, '[REDACTED:IP]');
}

function isEnvEntry(value: unknown): value is { key: unknown; value: unknown } {
  return typeof value === 'object' && value !== null && 'key' in value && 'value' in value;
}

export function redactDeep(value: unknown, secrets: readonly string[], parentKey = ''): unknown {
  if (typeof value === 'string') return redactString(value, secrets);
  if (Array.isArray(value)) {
    if (/^envs?$/i.test(parentKey)) {
      return value.map((item) =>
        isEnvEntry(item)
          ? { ...(redactDeep(item, secrets) as object), value: REDACTED }
          : redactDeep(item, secrets),
      );
    }
    return value.map((item) => redactDeep(item, secrets, parentKey));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === null || child === undefined || child === '') {
        out[key] = child;
      } else if (CREDENTIAL_KEY.test(key)) {
        out[key] = REDACTED;
      } else if (PII_KEY.test(key)) {
        out[key] = REDACTED_PII;
      } else {
        out[key] = redactDeep(child, secrets, key);
      }
    }
    return out;
  }
  return value;
}

/** Throws if a serialized payload still contains a secret value, a JWT, or a bearer credential. */
export function assertClean(serialized: string, secrets: readonly string[]): void {
  const leaks: string[] = [];
  if (secrets.some((secret) => serialized.includes(secret))) leaks.push('env value');
  if (new RegExp(JWT.source).test(serialized)) leaks.push('JWT');
  if (new RegExp(BEARER.source, 'i').test(serialized)) leaks.push('bearer credential');
  if (leaks.length > 0) {
    throw new Error(`Redaction check failed: payload still contains ${leaks.join(', ')}`);
  }
}
