// Loads <repo>/.env.local (or MIARA_ENV_FILE) into a private record, never into process.env, and never prints values.
// Core never reads env files (packages/core/src/config.ts); the apps do, then pass a record in.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { configFromEnv } from '@miara/core';
import type { CoreConfig } from '@miara/core';
import { config } from 'dotenv';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');

export class EnvError extends Error {
  override name = 'EnvError';
}

/** The merged env: process.env first, the env file over it. Throws EnvError naming keys only. */
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const path = source.MIARA_ENV_FILE
    ? resolve(source.MIARA_ENV_FILE)
    : resolve(REPO_ROOT, '.env.local');
  const fromFile: Record<string, string> = {};
  if (existsSync(path)) {
    const result = config({ path, processEnv: fromFile, quiet: true });
    if (result.error) throw new EnvError(`Could not parse ${path}`);
  }
  return { ...source, ...fromFile };
}

export function loadCoreConfig(source?: Record<string, string | undefined>): {
  config: CoreConfig;
  env: Record<string, string | undefined>;
} {
  const env = loadEnv(source);
  try {
    return { config: configFromEnv(env), env };
  } catch (err) {
    // configFromEnv names the missing/invalid keys, never their values.
    throw new EnvError(
      `${err instanceof Error ? err.message : 'Invalid config'}. Copy .env.example to .env.local and fill it in.`,
    );
  }
}
