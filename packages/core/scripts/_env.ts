import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config } from 'dotenv';

import { buildSecretSet } from '../src/redact/index.js';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');

export interface SpikeEnv {
  env: Record<string, string>;
  secrets: string[];
}

/** Loads <repo>/.env.local into a private record (not process.env). Never prints values. */
export function loadSpikeEnv(required: readonly string[]): SpikeEnv {
  const path = resolve(REPO_ROOT, '.env.local');
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  const env: Record<string, string> = {};
  const result = config({ path, processEnv: env, quiet: true });
  if (result.error) {
    console.error(`Could not parse .env.local: ${result.error.message}`);
    process.exit(1);
  }
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.error(`Missing keys in .env.local: ${missing.join(', ')}`);
    process.exit(1);
  }
  return { env, secrets: buildSecretSet(env) };
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
}
