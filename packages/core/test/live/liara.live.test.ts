// Live, READ-ONLY checks against the real Liara API. Skipped unless LIVE=1 (CLAUDE.md conventions).
// Run by the developer: LIVE=1 pnpm test   (secrets come from .env.local at runtime, never printed)
// When a live response fails its schema, the redacted body is saved as test/fixtures/liara/live-<endpoint>.json,
// so the mismatch becomes a recorded fixture that schemas.test.ts parses from then on.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLiaraClient } from '../../src/liara/client.js';
import { LiaraError } from '../../src/liara/errors.js';
import { getLogs } from '../../src/liara/logs.js';
import { offerablePlans } from '../../src/liara/plans.js';
import { assertClean, redactDeep } from '../../src/redact/index.js';

const LIVE = process.env.LIVE === '1';
const FIXTURES = resolve(import.meta.dirname, '../fixtures/liara');

describe.skipIf(!LIVE)(
  'Liara live reads (LIVE=1)',
  async () => {
    const { loadSpikeEnv } = await import('../../scripts/_env.js');
    const { env, secrets } = loadSpikeEnv(['LIARA_API_TOKEN']);

    // Keeps the last raw body per request so a schema failure can be saved (redacted) as a fixture.
    const lastBody = new Map<string, { query: Record<string, string>; body: unknown }>();
    const liara = createLiaraClient({
      token: env.LIARA_API_TOKEN ?? '',
      teamId: env.LIARA_TEAM_ID,
      secrets,
      fetch: async (url, init) => {
        const res = await fetch(url, init);
        try {
          const query = Object.fromEntries(url.searchParams);
          delete query.teamID; // never recorded (same as the spike)
          lastBody.set(url.pathname, { query, body: JSON.parse(await res.clone().text()) });
        } catch {
          // non-JSON bodies are not captured
        }
        return res;
      },
    });

    /** Runs a read; on a schema mismatch saves the redacted live body as a fixture and fails naming it. */
    async function check<T>(
      path: string,
      app: string | undefined,
      run: () => Promise<T>,
    ): Promise<T> {
      try {
        return await run();
      } catch (err) {
        if (!(err instanceof LiaraError && err.kind === 'invalid_response')) throw err;
        const captured = lastBody.get(path);
        const template = err.endpoint.replace(/^GET /, '');
        const name = `live-${template.replace(/[{}]/g, '').replace(/^\//, '').replace(/\//g, '-')}${app ? `-${app}` : ''}`;
        const fixture = {
          request: { method: 'GET', path: template, query: captured?.query ?? {} },
          source: `LIVE=1 capture of a schema mismatch: ${err.message}`,
          status: 200,
          capturedAt: new Date().toISOString(),
          issues: (err.raw as { issues?: unknown }).issues,
          body: redactDeep(captured?.body ?? null, secrets),
        };
        const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
        assertClean(serialized, secrets);
        writeFileSync(resolve(FIXTURES, `${name}.json`), serialized);
        throw new Error(
          `${err.message}\nSaved the redacted live body to test/fixtures/liara/${name}.json`,
          {
            cause: err,
          },
        );
      }
    }

    it('account, billing, plans, networks', async () => {
      const me = await check('/v1/me', undefined, () => liara.getMe());
      expect(offerablePlans(me).length).toBeGreaterThan(0);
      const balance = await check('/v1/billing', undefined, () => liara.getBalance());
      expect(balance.scope).toBe(env.LIARA_TEAM_ID ? 'team' : 'user');
      await check('/v1/networks', undefined, () => liara.listNetworks());
    });

    it('every app: details, logs (v2 primary), events, releases, domains', async () => {
      const { projects } = await check('/v1/projects', undefined, () => liara.listApps());
      const apps = env.LIARA_SPIKE_APP ? [env.LIARA_SPIKE_APP] : projects.map((p) => p.project_id);
      const failures: string[] = [];
      for (const app of apps) {
        const a = encodeURIComponent(app);
        const steps: [string, () => Promise<unknown>][] = [
          [`/v1/projects/${a}`, () => liara.getApp(app)],
          // v2 directly: getLogs() would hide a v2 schema drift by falling back to v1.
          [
            `/v2/projects/${a}/logs`,
            () => liara.getLogsV2(app, Math.floor(Date.now() / 1000) - 3600),
          ],
          [
            `/v1/projects/${a}/logs`,
            () => getLogs(liara, app, Math.floor(Date.now() / 1000) - 3600),
          ],
          [`/v1/projects/${a}/events`, () => liara.getEvents(app)],
          [`/v1/projects/${a}/releases`, () => liara.listReleases(app)],
          // First live call of GET v1/domains?project= (spec only until now).
          ['/v1/domains', () => liara.listDomains(app)],
        ];
        for (const [path, run] of steps) {
          // Keep going so one run captures every mismatch, across all apps.
          await check(path, app, run).catch((e: unknown) =>
            failures.push(`${app} ${path}: ${e instanceof Error ? e.message : String(e)}`),
          );
        }
      }
      expect(failures).toEqual([]);
    });
  },
  120_000,
);
