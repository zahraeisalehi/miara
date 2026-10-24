// Recognises "Miara's own database is down / not set up" so the apps can say so plainly instead of "internal error".
// Drizzle wraps driver failures (DrizzleQueryError.cause) and Node wraps multi-address connects (AggregateError),
// so the code can sit a few levels down.

/** Node socket codes, postgres.js connection codes, and PG SQLSTATEs for shutdown/starting/missing database. */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now (starting up)
  '3D000', // invalid_catalog_name (database missing)
]);

const NOT_MIGRATED_CODES = new Set(['42P01']); // undefined_table

const MAX_DEPTH = 6;

function hasCode(err: unknown, codes: Set<string>): boolean {
  const seen = new Set<unknown>();
  const walk = (e: unknown, depth: number): boolean => {
    if (depth > MAX_DEPTH || typeof e !== 'object' || e === null || seen.has(e)) return false;
    seen.add(e);
    const code = 'code' in e ? e.code : undefined;
    if (typeof code === 'string' && codes.has(code)) return true;
    if (e instanceof AggregateError && e.errors.some((x) => walk(x, depth + 1))) return true;
    return 'cause' in e && walk(e.cause, depth + 1);
  };
  return walk(err, 0);
}

export const isDbUnavailable = (err: unknown): boolean => hasCode(err, UNAVAILABLE_CODES);
export const isDbNotMigrated = (err: unknown): boolean => hasCode(err, NOT_MIGRATED_CODES);

export const DB_UNAVAILABLE_MESSAGE = {
  fa: 'میارا به پایگاه داده‌ی خودش (Postgres روی پورت ۵۴۳۳) دسترسی ندارد. با `docker compose -p miara up -d db` آن را روشن کنید و دوباره امتحان کنید.',
  en: "Miara can't reach its own database (Postgres on localhost:5433). Start it with `docker compose -p miara up -d db`, then retry.",
};

export const DB_NOT_MIGRATED_MESSAGE = {
  fa: 'پایگاه داده‌ی میارا هنوز جدول ندارد. `pnpm db:migrate` را اجرا کنید و دوباره امتحان کنید.',
  en: "Miara's database has no tables yet. Run `pnpm db:migrate`, then retry.",
};

/** One plain line for a startup probe or CLI, or undefined if the error is not a database-setup problem. */
export function dbProblemMessage(err: unknown): { fa: string; en: string } | undefined {
  if (isDbUnavailable(err)) return DB_UNAVAILABLE_MESSAGE;
  if (isDbNotMigrated(err)) return DB_NOT_MIGRATED_MESSAGE;
  return undefined;
}
