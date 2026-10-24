// App scope (D21). The Liara token is team-wide, and the team may hold apps that are none of Miara's business
// (e.g. a live trading bot). MIARA_APP_SCOPE lists the apps Miara may see or touch: a comma list of names or
// globs (`*` = any run of characters, `?` = one). Apps outside it are invisible (filtered out of list_apps) and
// every tool that targets one is refused by the policy gate, before any Liara call. There is no default: core
// refuses to start without a scope.

export interface AppScope {
  /** The patterns as configured, for messages. */
  readonly patterns: readonly string[];
  allows(app: string): boolean;
}

const PATTERN = /^[a-z0-9*?][a-z0-9*?-]*$/;

function toRegExp(glob: string): RegExp {
  const body = glob
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`);
}

export class AppScopeError extends Error {
  override name = 'AppScopeError';
}

/** Parses "miara-*,buggy-*". Throws AppScopeError on an empty or malformed value (never silently allows all). */
export function parseAppScope(spec: string | undefined): AppScope {
  const patterns = (spec ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) {
    throw new AppScopeError(
      'MIARA_APP_SCOPE is not set. Miara refuses to start without an app scope, because the Liara token can reach ' +
        'every app in the team. Set it in .env.local, e.g. MIARA_APP_SCOPE=miara-*,buggy-*',
    );
  }
  const bad = patterns.filter((p) => !PATTERN.test(p));
  if (bad.length > 0) {
    throw new AppScopeError(
      `MIARA_APP_SCOPE has invalid patterns: ${bad.join(', ')} (use app names with * or ?, comma-separated).`,
    );
  }
  const regexps = patterns.map(toRegExp);
  return Object.freeze({
    patterns,
    allows: (app: string) => regexps.some((r) => r.test(app.toLowerCase())),
  });
}
