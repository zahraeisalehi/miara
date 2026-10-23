// Every read tool runs through the gate on the recorded fixtures (Phase 1 "done when": read tools pass on fixtures).
import { describe, expect, it } from 'vitest';

import { APP, makeGate } from '../policy/gate.suite.js';
import { createMemoryApprovalStore } from '../policy/store.js';

import { readTools } from './read.js';
import { maskSensitive } from './registry.js';

const ARGS: Record<string, unknown> = {
  list_apps: {},
  get_app: { app: APP },
  get_logs: { app: APP },
  get_events: { app: APP },
  list_releases: { app: APP },
  get_release: { releaseId: '6ada4a5f7ebf55567c84fb56' },
  get_build_logs: { releaseId: '6ada4a5f7ebf55567c84fb56' },
  get_metrics_summary: { app: APP },
  get_metrics: { app: APP, kind: 'cpu' },
  get_billing: {},
  list_networks: {},
  list_plans: {},
};

describe('read tools on fixtures', () => {
  it('covers every read tool', () => {
    expect(readTools.map((t) => t.name).sort()).toEqual(Object.keys(ARGS).sort());
    expect(readTools.every((t) => t.tier === 0)).toBe(true);
  });

  for (const [name, args] of Object.entries(ARGS)) {
    it(name, async () => {
      const { gate, writes } = makeGate(createMemoryApprovalStore());
      const r = await gate.propose(name, args, { actor: 'mcp' });
      expect(r).toMatchObject({ kind: 'result', tier: 0 });
      expect(writes()).toHaveLength(0);
    });
  }

  it('get_logs returns sorted v2 lines', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    const r = await gate.propose('get_logs', { app: APP }, { actor: 'mcp' });
    expect(r.kind === 'result' && r.result).toMatchObject({
      source: 'v2',
      total: 14,
      truncated: false,
    });
  });

  it('list_plans prices bundles and recommends standard', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    const r = await gate.propose('list_plans', {}, { actor: 'web' });
    expect(r.kind === 'result' && r.result).toMatchObject({
      currency: 'toman',
      vatRate: 0.1,
      recommendation: { bundlePlanID: 'standard' },
    });
  });

  it('registry publishes JSON Schemas for MCP', () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    expect(gate.registry.get('get_metrics')?.inputSchema).toMatchObject({
      type: 'object',
      properties: { kind: { enum: ['cpu', 'memory'] } },
    });
  });
});

describe('maskSensitive', () => {
  it('masks values under an object path but keeps keys; leaves the input untouched', () => {
    const args = { app: 'a', set: { A: 'secret', B: 'x' }, unset: ['C'] };
    expect(maskSensitive(args, ['set'])).toEqual({
      app: 'a',
      set: { A: '[REDACTED]', B: '[REDACTED]' },
      unset: ['C'],
    });
    expect(args.set.A).toBe('secret');
    expect(maskSensitive({ token: 't' }, ['token'])).toEqual({ token: '[REDACTED]' });
    expect(maskSensitive({ a: 1 }, ['missing.path'])).toEqual({ a: 1 });
  });
});
