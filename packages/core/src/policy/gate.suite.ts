// Shared policy-gate tests, run against every ApprovalStore (memory: gate.test.ts, Postgres: db/db.pg.test.ts).
import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { fixtureRoutes, testClient } from '../../test/helpers/liara-mock.js';
import type { Reply } from '../../test/helpers/liara-mock.js';
import { REDACTED } from '../redact/index.js';
import { createMemoryTimelineSink } from '../timeline/memory.js';
import { createTimeline } from '../timeline/operation.js';
import { readTools } from '../tools/read.js';
import { writeTools } from '../tools/write.js';

import { createPolicyGate } from './gate.js';
import type { PolicyGate } from './gate.js';
import type { ApprovalStore } from './store.js';

export const APP = 'miara-something';
const ACK: Reply = { status: 200, body: { message: 'ok' } };

export interface StoreHarness {
  store: ApprovalStore;
  reset(): Promise<void>;
  /** Moves the approval's expires_at into the past. */
  expire(id: string): Promise<void>;
  /** Rewrites the stored args behind the gate's back. */
  tamper(id: string, args: unknown): Promise<void>;
}

export function makeGate(
  store: ApprovalStore,
  routes: Record<string, Reply> = {},
  now: () => Date = () => new Date(),
) {
  const { client, calls } = testClient({
    ...fixtureRoutes(),
    [`POST /v1/projects/${APP}/actions/restart`]: ACK,
    [`POST /v1/projects/${APP}/actions/scale`]: ACK,
    [`POST /v1/projects/${APP}/resize`]: ACK,
    'POST /v1/projects/update-envs': ACK,
    ...routes,
  });
  const sink = createMemoryTimelineSink();
  const timeline = createTimeline({ sink, secrets: [], now });
  const gate = createPolicyGate({
    tools: [...readTools, ...writeTools],
    store,
    timeline,
    ctx: { liara: client, now },
    secrets: [],
  });
  const writes = () => calls.filter((c) => c.method === 'POST');
  return { gate, calls, writes, sink };
}

async function pendingId(gate: PolicyGate, tool: string, args: unknown): Promise<string> {
  const r = await gate.propose(tool, args, { actor: 'web' });
  if (r.kind !== 'pending_approval') throw new Error(`expected pending_approval for ${tool}`);
  return r.approval.id;
}

export function gateSuite(name: string, harness: () => StoreHarness) {
  describe(`policy gate (${name})`, () => {
    let h: StoreHarness;
    beforeEach(async () => {
      h = harness();
      await h.reset();
    });

    it('tier 0 runs directly and is redacted', async () => {
      const { gate, sink } = makeGate(h.store);
      const r = await gate.propose('get_app', { app: APP }, { actor: 'mcp' });
      expect(r.kind).toBe('result');
      if (r.kind !== 'result') return;
      expect(r.tier).toBe(0);
      expect(
        (r.result as { envs: { value: string }[] }).envs.every((e) => e.value === REDACTED),
      ).toBe(true);
      expect(sink.events.map((e) => [e.status, e.mode])).toEqual([
        ['start', 'read'],
        ['success', 'read'],
      ]);
    });

    it('tier 1 runs automatically and visibly (restart)', async () => {
      const { gate, writes, sink } = makeGate(h.store);
      const r = await gate.propose('restart_app', { app: APP }, { actor: 'web' });
      expect(r).toMatchObject({ kind: 'result', tier: 1 });
      expect(writes().map((c) => c.path)).toEqual([`/v1/projects/${APP}/actions/restart`]);
      expect(sink.events.map((e) => e.status)).toEqual(['start', 'success']);
    });

    it('tier 2 returns a pending approval and calls nothing', async () => {
      const { gate, writes } = makeGate(h.store);
      const r = await gate.propose('set_app_power', { app: APP, on: false }, { actor: 'web' });
      expect(r.kind).toBe('pending_approval');
      if (r.kind !== 'pending_approval') return;
      expect(r.approval).toMatchObject({
        tool: 'set_app_power',
        tier: 2,
        app: APP,
        approvedAt: null,
      });
      expect(r.approval.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
      expect(writes()).toHaveLength(0);
    });

    it('approve then execute succeeds exactly once', async () => {
      const { gate, writes } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await gate.approve(id, { approver: 'web-user' });
      const r = await gate.execute(id, { actor: 'web' });
      expect(r).toMatchObject({ kind: 'result', tier: 2 });
      expect(writes().map((c) => c.json)).toEqual([{ scale: 0 }]);
      await expect(gate.execute(id, { actor: 'web' })).rejects.toMatchObject({ kind: 'used' });
      await expect(gate.approve(id, { approver: 'web-user' })).rejects.toMatchObject({
        kind: 'used',
      });
      expect(writes()).toHaveLength(1);
      // Stored args are cleared after use.
      expect((await h.store.get(id))?.args).toBeNull();
    });

    it('refuses execute without approve', async () => {
      const { gate, writes } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await expect(gate.execute(id, { actor: 'mcp' })).rejects.toMatchObject({
        kind: 'not_approved',
      });
      expect(writes()).toHaveLength(0);
    });

    it('refuses approve twice', async () => {
      const { gate } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await gate.approve(id, { approver: 'web-user' });
      await expect(gate.approve(id, { approver: 'web-user' })).rejects.toMatchObject({
        kind: 'already_approved',
      });
    });

    it('tamper: stored args changed in the DB', async () => {
      const { gate, writes } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await gate.approve(id, { approver: 'web-user' });
      await h.tamper(id, { app: 'someone-else', on: false });
      await expect(gate.execute(id, { actor: 'web' })).rejects.toMatchObject({ kind: 'tampered' });
      expect(writes()).toHaveLength(0);
    });

    it('tamper: caller resends different args (MCP path); identical args pass', async () => {
      const { gate, writes } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await gate.approve(id, { approver: 'mcp-elicitation' });
      await expect(
        gate.execute(id, { actor: 'mcp', args: { app: 'someone-else', on: false } }),
      ).rejects.toMatchObject({ kind: 'tampered' });
      await gate.execute(id, { actor: 'mcp', args: { on: false, app: APP } });
      expect(writes()).toHaveLength(1);
    });

    it('expiry: approve and execute are both refused', async () => {
      const { gate, writes } = makeGate(h.store);
      const a = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await h.expire(a);
      await expect(gate.approve(a, { approver: 'web-user' })).rejects.toMatchObject({
        kind: 'expired',
      });

      const b = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await gate.approve(b, { approver: 'web-user' });
      await h.expire(b);
      await expect(gate.execute(b, { actor: 'web' })).rejects.toMatchObject({ kind: 'expired' });
      expect(writes()).toHaveLength(0);
    });

    it('tier 3: wrong confirmation consumes nothing; the right one approves; cost is previewed', async () => {
      const { gate, writes } = makeGate(h.store);
      const r = await gate.propose(
        'change_plan',
        { app: APP, planID: 'medium-g2' },
        { actor: 'web' },
      );
      if (r.kind !== 'pending_approval') throw new Error('expected pending');
      expect(r.approval.tier).toBe(3);
      expect(r.approval.confirmationHint).toBe(APP);
      expect(r.approval.costPreview).toMatchObject({
        current: { planID: 'small-g2', bundlePlanID: 'basic' },
        next: { planID: 'medium-g2', bundlePlanID: 'basic' },
      });
      expect(r.approval.costPreview?.deltaMonthlyWithVat).toBeGreaterThan(0);

      const id = r.approval.id;
      await expect(gate.approve(id, { approver: 'web-user' })).rejects.toMatchObject({
        kind: 'wrong_confirmation',
      });
      await expect(
        gate.approve(id, { approver: 'web-user', typedConfirmation: 'miara' }),
      ).rejects.toMatchObject({ kind: 'wrong_confirmation' });
      await gate.approve(id, { approver: 'web-user', typedConfirmation: ` ${APP} ` });
      await gate.execute(id, { actor: 'web' });
      expect(writes().map((c) => [c.path, c.json])).toEqual([
        [`/v1/projects/${APP}/resize`, { planID: 'medium-g2' }],
      ]);
    });

    it('unknown approval id', async () => {
      const { gate } = makeGate(h.store);
      const id = randomUUID();
      await expect(gate.approve(id, { approver: 'web-user' })).rejects.toMatchObject({
        kind: 'not_found',
      });
      await expect(gate.execute(id, { actor: 'web' })).rejects.toMatchObject({ kind: 'not_found' });
    });

    it('concurrent double-execute: exactly one wins', async () => {
      const { gate, writes } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      await gate.approve(id, { approver: 'web-user' });
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => gate.execute(id, { actor: 'web' })),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(writes()).toHaveLength(1);
    });

    it('concurrent double-approve: exactly one wins', async () => {
      const { gate } = makeGate(h.store);
      const id = await pendingId(gate, 'set_app_power', { app: APP, on: false });
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => gate.approve(id, { approver: 'web-user' })),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('sensitive env values are masked in propose, approval reads and the timeline', async () => {
      const { gate, sink, writes } = makeGate(h.store, {
        'GET /v1/domains': { status: 200, body: { domains: [{ _id: 'd1', name: 'example.ir' }] } },
      });
      const secret = 'postgres://user:hunter2@db/app';
      const r = await gate.propose(
        'set_env',
        { app: APP, set: { DATABASE_URL: secret } },
        { actor: 'web' },
      );
      if (r.kind !== 'pending_approval') throw new Error('custom domain → tier 2');
      expect(r.approval.tier).toBe(2);
      const id = r.approval.id;
      const views = [r.approval, await gate.getApproval(id), ...(await gate.listPending())];
      for (const v of views) {
        expect(JSON.stringify(v)).not.toContain('hunter2');
        expect(v?.args).toMatchObject({ set: { DATABASE_URL: REDACTED } });
      }
      // The raw value lives only in the store until use.
      expect(JSON.stringify((await h.store.get(id))?.args)).toContain('hunter2');

      await gate.approve(id, { approver: 'web-user' });
      const done = await gate.execute(id, { actor: 'web' });
      expect(JSON.stringify(done)).not.toContain('hunter2');
      expect(JSON.stringify(sink.events)).not.toContain('hunter2');
      // update-envs got the merged set: existing envs + the new one.
      const sent = writes()[0]?.json as { variables: { key: string; value: string }[] };
      expect(sent.variables.map((v) => v.key)).toEqual(['PORT', 'NODE_ENV', 'DATABASE_URL']);
      expect(sent.variables.at(-1)?.value).toBe(secret);
      expect((await h.store.get(id))?.args).toBeNull();
    });
  });
}
