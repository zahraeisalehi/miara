// All Postgres tests live in this one file so migrations and truncation never race across workers.
// Skips with a message when the compose container (localhost:5433) is down.
import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDb,
  DB_DOWN_MESSAGE,
  dbAvailable,
  testDb,
  truncateAll,
} from '../../test/helpers/db.js';
import { gateSuite } from '../policy/gate.suite.js';
import { createTimeline } from '../timeline/operation.js';

import { createPgApprovalStore, purgeExpiredApprovalArgs } from './approval-store.js';
import type { Db } from './client.js';
import { approvals } from './schema.js';
import { createPgTimelineSink } from './timeline-sink.js';

const db: Db | undefined = dbAvailable ? await testDb() : undefined;

describe.skipIf(!db)(db ? 'Postgres' : DB_DOWN_MESSAGE, () => {
  afterAll(closeTestDb);

  if (db) {
    gateSuite('postgres store', () => ({
      store: createPgApprovalStore(db),
      reset: () => truncateAll(db),
      expire: async (id) => {
        await db
          .update(approvals)
          .set({ expiresAt: sql`now() - interval '1 second'` })
          .where(eq(approvals.id, id));
      },
      tamper: async (id, args) => {
        await db.update(approvals).set({ args }).where(eq(approvals.id, id));
      },
    }));
  }

  describe('timeline sink', () => {
    beforeEach(async () => {
      if (db) await truncateAll(db);
    });

    it('stores events in order, redacted, and counts auto starts for the breaker', async () => {
      if (!db) return;
      const sink = createPgTimelineSink(db);
      const timeline = createTimeline({ sink, secrets: ['secret-value-123'] });
      const meta = {
        tool: 'restart_app',
        app: 'demo',
        tier: 1,
        mode: 'auto' as const,
        actor: 'worker' as const,
        labelFa: 'ری‌استارت اپ',
        labelEn: 'Restart',
        data: { note: 'has secret-value-123' },
      };
      await timeline.withOperation(meta, async () => 1);
      await timeline.withOperation({ ...meta, mode: 'approved' }, async () => 1);
      await timeline.recordLlm(
        { job: 'router', model: 'm', costUsd: 0.0001, latencyMs: 5 },
        { actor: 'web', ok: true },
      );

      const events = await sink.list({ app: 'demo' });
      expect(events.map((e) => [e.status, e.mode])).toEqual([
        ['start', 'auto'],
        ['success', 'auto'],
        ['start', 'approved'],
        ['success', 'approved'],
      ]);
      expect(JSON.stringify(events)).not.toContain('secret-value-123');
      expect(
        await sink.countAutoStarts({ tool: 'restart_app', app: 'demo', since: new Date(0) }),
      ).toBe(1);
      const [llm] = await db.execute<{ llm_cost_usd: number }>(
        sql`select llm_cost_usd from timeline_events where type = 'llm_call'`,
      );
      expect(llm?.llm_cost_usd).toBeCloseTo(0.0001);
    });
  });

  describe('approval args retention', () => {
    it('purges stored args of expired, unused approvals', async () => {
      if (!db) return;
      await truncateAll(db);
      const store = createPgApprovalStore(db);
      const base = {
        tool: 'set_env',
        app: 'demo',
        args: { set: { K: 'secret' } },
        argsHash: 'h',
        tier: 2 as const,
        escalation: null,
        costPreview: null,
        confirmationText: null,
        actor: 'web' as const,
        createdAt: new Date(),
      };
      const expired = randomUUID();
      const live = randomUUID();
      await store.insert({ ...base, id: expired, expiresAt: new Date(Date.now() - 60_000) });
      await store.insert({ ...base, id: live, expiresAt: new Date(Date.now() + 60_000) });
      expect(await purgeExpiredApprovalArgs(db)).toBe(1);
      expect((await store.get(expired))?.args).toBeNull();
      expect((await store.get(live))?.args).toEqual(base.args);
    });
  });
});
