// Live, READ-ONLY checks against the real Liara API. Skipped unless LIVE=1 (CLAUDE.md conventions).
// Run by the developer: LIVE=1 pnpm test   (secrets come from .env.local at runtime, never printed)
import { describe, expect, it } from 'vitest';

import { createLiaraClient } from '../../src/liara/client.js';
import { getLogs } from '../../src/liara/logs.js';
import { offerablePlans } from '../../src/liara/plans.js';

const LIVE = process.env.LIVE === '1';

describe.skipIf(!LIVE)(
  'Liara live reads (LIVE=1)',
  async () => {
    const { loadSpikeEnv } = await import('../../scripts/_env.js');
    const { env, secrets } = loadSpikeEnv(['LIARA_API_TOKEN']);
    const liara = createLiaraClient({
      token: env.LIARA_API_TOKEN ?? '',
      teamId: env.LIARA_TEAM_ID,
      secrets,
    });

    it('account, billing, plans, networks', async () => {
      expect(offerablePlans(await liara.getMe()).length).toBeGreaterThan(0);
      const balance = await liara.getBalance();
      expect(balance.scope).toBe(env.LIARA_TEAM_ID ? 'team' : 'user');
      await liara.listNetworks();
    });

    it('apps, details, logs (v2 primary), events, releases, domains', async () => {
      const { projects } = await liara.listApps();
      const app = env.LIARA_SPIKE_APP ?? projects[0]?.project_id;
      if (!app) return;
      await liara.getApp(app);
      expect((await getLogs(liara, app, Math.floor(Date.now() / 1000) - 3600)).source).toBe('v2');
      await liara.getEvents(app);
      await liara.listReleases(app);
      // Unverified until now (spec only): this is the first live call of GET v1/domains?project=.
      await liara.listDomains(app);
    });
  },
  60_000,
);
