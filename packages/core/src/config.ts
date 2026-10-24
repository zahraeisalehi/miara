// Core configuration. Core never reads `.env*` files: apps pass `process.env` (or a test record) in.
import { z } from 'zod';

import { parseAppScope } from './policy/scope.js';
import { buildSecretSet } from './redact/index.js';

/** Compose dev URL from docker-compose.yml (dev-only credentials, not a secret). */
export const DEFAULT_DATABASE_URL = 'postgres://miara:miara@localhost:5433/miara';

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

export const CoreConfig = z.object({
  liaraToken: z.string().min(1),
  /** Team mode (docs/liara/api-findings.md §0): sent as `teamID` on every Liara call when set. */
  liaraTeamId: optional,
  boxapiKey: z.string().min(1),
  boxapiModel: z.string().min(1),
  databaseUrl: z.string().min(1).default(DEFAULT_DATABASE_URL),
  /** D21: MIARA_APP_SCOPE, e.g. `miara-*,buggy-*`. Required: Miara never runs against a whole team unscoped. */
  appScope: z.string().min(1),
});
export type CoreConfig = z.infer<typeof CoreConfig>;

/** Maps env keys (see .env.example) to CoreConfig. Errors name missing keys, never values. */
export function configFromEnv(env: Record<string, string | undefined>): CoreConfig {
  // Throws AppScopeError with a plain message when MIARA_APP_SCOPE is missing or malformed.
  parseAppScope(env.MIARA_APP_SCOPE);
  const parsed = CoreConfig.safeParse({
    liaraToken: env.LIARA_API_TOKEN,
    liaraTeamId: env.LIARA_TEAM_ID,
    boxapiKey: env.BOXAPI_API_KEY,
    boxapiModel: env.BOXAPI_MODEL,
    databaseUrl: env.DATABASE_URL || undefined,
    appScope: env.MIARA_APP_SCOPE,
  });
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid Miara config: ${keys}`);
  }
  return parsed.data;
}

/** Values to scrub from anything that leaves the process (redact/). */
export function secretsOf(config: CoreConfig): string[] {
  return buildSecretSet({
    LIARA_API_TOKEN: config.liaraToken,
    LIARA_TEAM_ID: config.liaraTeamId,
    BOXAPI_API_KEY: config.boxapiKey,
  });
}
