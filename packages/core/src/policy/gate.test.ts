import { readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { APP, gateSuite, makeGate } from './gate.suite.js';
import { AUTO_DEPLOYS_PER_HOUR, AUTO_RESTARTS_PER_HOUR, BREAKER_WINDOW_MS } from './breaker.js';
import { createMemoryApprovalStore } from './store.js';

gateSuite('memory store', () => {
  const store = createMemoryApprovalStore();
  return {
    store,
    reset: async () => store.rows.clear(),
    expire: async (id) => {
      const row = store.rows.get(id);
      if (row) row.expiresAt = new Date(Date.now() - 1000);
    },
    tamper: async (id, args) => {
      const row = store.rows.get(id);
      if (row) row.args = args;
    },
  };
});

function clock(start = Date.now()) {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe('per-call tier (D19)', () => {
  it('power on is tier 1, power off tier 2', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    expect(
      await gate.propose('set_app_power', { app: APP, on: true }, { actor: 'web' }),
    ).toMatchObject({
      kind: 'result',
      tier: 1,
    });
    expect(
      (await gate.propose('set_app_power', { app: APP, on: false }, { actor: 'web' })).kind,
    ).toBe('pending_approval');
  });

  it('set_env is tier 1 without a custom domain, tier 2 with one', async () => {
    const plain = makeGate(createMemoryApprovalStore());
    expect(
      await plain.gate.propose('set_env', { app: APP, set: { A: 'b' } }, { actor: 'web' }),
    ).toMatchObject({ kind: 'result', tier: 1 });
    const domain = makeGate(createMemoryApprovalStore(), {
      'GET /v1/domains': { status: 200, body: { domains: [{ _id: 'd', name: 'x.ir' }] } },
    });
    const r = await domain.gate.propose('set_env', { app: APP, set: { A: 'b' } }, { actor: 'web' });
    expect(r.kind === 'pending_approval' && r.approval.tier).toBe(2);
  });

  it('a failing tierFor fails closed to tier 2', async () => {
    const { gate, writes } = makeGate(createMemoryApprovalStore(), {
      'GET /v1/domains': { status: 500, body: {} },
    });
    const r = await gate.propose('set_env', { app: APP, unset: ['A'] }, { actor: 'web' });
    expect(r.kind === 'pending_approval' && r.approval.tier).toBe(2);
    expect(writes()).toHaveLength(0);
  });

  it('tier 3 tools stay tier 3', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    const r = await gate.propose(
      'create_app',
      {
        name: 'buggy-new-app',
        platform: 'node',
        planID: 'small-g2',
        bundlePlanID: 'standard',
        networkId: '6ad9efc312fe5042a6a082da',
      },
      { actor: 'web' },
    );
    expect(r.kind === 'pending_approval' && r.approval).toMatchObject({
      tier: 3,
      confirmationHint: 'buggy-new-app',
      costPreview: { next: { planID: 'small-g2', bundlePlanID: 'standard' } },
    });
  });

  it('create_app requires networkId and an existing network', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    const base = {
      name: 'buggy-new-app',
      platform: 'node',
      planID: 'small-g2',
      bundlePlanID: 'standard',
    };
    await expect(gate.propose('create_app', base, { actor: 'web' })).rejects.toMatchObject({
      kind: 'invalid_args',
    });
    await expect(
      gate.propose('create_app', { ...base, networkId: 'nope' }, { actor: 'web' }),
    ).rejects.toMatchObject({ name: 'ToolInputError' });
  });

  it('change_plan refuses a plan ID that is not in the live catalog', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    await expect(
      gate.propose('change_plan', { app: APP, planID: 'made-up-g2' }, { actor: 'web' }),
    ).rejects.toMatchObject({ name: 'ToolInputError' });
  });
});

describe('tier-1 circuit breaker', () => {
  it(`escalates the restart after ${AUTO_RESTARTS_PER_HOUR} automatic ones, and resets after the window`, async () => {
    const c = clock();
    const { gate, writes } = makeGate(
      createMemoryApprovalStore(c.now),
      { 'POST /v1/projects/other/actions/restart': { status: 200, body: {} } },
      c.now,
    );
    for (let i = 0; i < AUTO_RESTARTS_PER_HOUR; i += 1) {
      expect((await gate.propose('restart_app', { app: APP }, { actor: 'worker' })).kind).toBe(
        'result',
      );
      c.advance(60_000);
    }
    const third = await gate.propose('restart_app', { app: APP }, { actor: 'worker' });
    expect(third.kind).toBe('pending_approval');
    if (third.kind !== 'pending_approval') return;
    expect(third.approval.tier).toBe(2);
    expect(third.approval.escalation?.reasonFa).toContain('ری‌استارت خودکار');
    expect(third.approval.escalation?.reasonEn).toContain(
      `${AUTO_RESTARTS_PER_HOUR} automatic restarts`,
    );

    // An approved restart does not count as automatic.
    await gate.approve(third.approval.id, { approver: 'web-user' });
    await gate.execute(third.approval.id, { actor: 'web' });
    expect(writes()).toHaveLength(AUTO_RESTARTS_PER_HOUR + 1);

    // Still inside the window: still escalated.
    expect((await gate.propose('restart_app', { app: APP }, { actor: 'worker' })).kind).toBe(
      'pending_approval',
    );
    // Other apps have their own budget.
    expect((await gate.propose('restart_app', { app: 'miara-other' }, { actor: 'worker' })).kind).toBe(
      'result',
    );

    c.advance(BREAKER_WINDOW_MS);
    expect((await gate.propose('restart_app', { app: APP }, { actor: 'worker' })).kind).toBe(
      'result',
    );
  });

  it(`escalates the deploy after ${AUTO_DEPLOYS_PER_HOUR} automatic ones; a changed archive is refused`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miara-deploy-'));
    const archivePath = join(dir, 'source.tar.gz');
    await writeFile(archivePath, gzipSync(Buffer.from('fake tar')));
    const c = clock();
    const { gate, writes, sink } = makeGate(
      createMemoryApprovalStore(c.now),
      {
        [`POST /v2/projects/${APP}/sources`]: { status: 200, body: { sourceID: 'src' } },
        [`POST /v2/projects/${APP}/releases`]: { status: 200, body: { releaseID: 'rel' } },
      },
      c.now,
    );
    const args = { app: APP, archivePath, port: 3000, platform: 'node' };
    for (let i = 0; i < AUTO_DEPLOYS_PER_HOUR; i += 1) {
      expect(await gate.propose('deploy_release', args, { actor: 'mcp' })).toMatchObject({
        kind: 'result',
        result: { releaseID: 'rel' },
      });
    }
    const next = await gate.propose('deploy_release', args, { actor: 'mcp' });
    if (next.kind !== 'pending_approval') throw new Error('expected escalation');
    expect(next.approval.escalation?.reasonEn).toContain('deploys');
    expect(next.approval.args).toMatchObject({ archiveSha256: expect.any(String) });

    // The archive changes between approval and execution: refused before any upload.
    await writeFile(archivePath, gzipSync(Buffer.from('different tar')));
    await gate.approve(next.approval.id, { approver: 'web-user' });
    const before = writes().length;
    await expect(gate.execute(next.approval.id, { actor: 'mcp' })).rejects.toMatchObject({
      name: 'ToolInputError',
    });
    expect(writes()).toHaveLength(before);
    expect(sink.events.at(-1)).toMatchObject({ status: 'failure', tool: 'deploy_release' });
  });

  it('refuses a non-gzip file named .tar.gz', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miara-deploy-'));
    const archivePath = join(dir, 'secrets.tar.gz');
    await writeFile(archivePath, 'not gzip');
    const { gate, writes } = makeGate(createMemoryApprovalStore());
    await expect(
      gate.propose(
        'deploy_release',
        { app: APP, archivePath, port: 3000, platform: 'node' },
        { actor: 'mcp' },
      ),
    ).rejects.toMatchObject({ name: 'ToolInputError' });
    expect(writes()).toHaveLength(0);
  });
});

describe('unknown outcome', () => {
  it('a write timeout is recorded as unknown (never failure) and the app is re-read', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const { gate, sink } = makeGate(createMemoryApprovalStore(), {
      [`POST /v1/projects/${APP}/actions/restart`]: timeout as never,
    });
    await expect(gate.propose('restart_app', { app: APP }, { actor: 'web' })).rejects.toMatchObject(
      {
        kind: 'unknown_outcome',
      },
    );
    expect(sink.events.map((e) => e.status)).toEqual(['start', 'unknown', 'info']);
    expect(sink.events.some((e) => e.status === 'failure')).toBe(false);
    expect(sink.events[1]?.messageFa).toContain('نتیجه مشخص نیست');
    expect(sink.events[2]?.data).toMatchObject({ app: APP, status: 'ACTIVE', planID: 'small-g2' });
  });
});

describe('approve is never a tool', () => {
  it('is not in the registry and cannot be proposed', async () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    const names = gate.registry.list().map((t) => t.name);
    expect(names.filter((n) => /approv|execute|confirm/i.test(n))).toEqual([]);
    await expect(gate.propose('approve', { id: 'x' }, { actor: 'mcp' })).rejects.toMatchObject({
      kind: 'unknown_tool',
    });
  });

  it('registry metadata exposes no handlers', () => {
    const { gate } = makeGate(createMemoryApprovalStore());
    for (const info of gate.registry.list()) {
      expect(Object.keys(info).sort()).toEqual(
        ['description', 'dynamicTier', 'inputSchema', 'name', 'sensitive', 'targetsApp', 'tier'].sort(),
      );
    }
    expect(gate.registry.get('set_env')?.sensitive).toEqual(['set']);
    expect(gate.registry.get('restart_app')).toMatchObject({ tier: 1, dynamicTier: true });
  });

  it('tool handlers get only liara, incidents, scope + clock, never the gate', async () => {
    const seen: string[] = [];
    const { writeTools } = await import('../tools/write.js');
    const restart = writeTools.find((t) => t.name === 'restart_app');
    if (!restart) throw new Error('restart_app missing');
    const { gate } = makeGate(createMemoryApprovalStore());
    const original = restart.handler;
    restart.handler = async (args, ctx) => {
      seen.push(...Object.keys(ctx));
      return original(args, ctx);
    };
    try {
      await gate.propose('restart_app', { app: APP }, { actor: 'web' });
    } finally {
      restart.handler = original;
    }
    expect(seen.sort()).toEqual(['incidents', 'liara', 'now', 'scope']);
  });

  it('invalid input is refused before anything runs', async () => {
    const { gate, calls } = makeGate(createMemoryApprovalStore());
    await expect(gate.propose('restart_app', { app: '' }, { actor: 'web' })).rejects.toMatchObject({
      kind: 'invalid_args',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('no bypass flag (CLAUDE.md non-negotiable 2)', () => {
  const SRC = resolve(import.meta.dirname, '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory()
        ? files(p)
        : p.endsWith('.ts') && !p.includes('.test.') && !p.includes('.suite.')
          ? [p]
          : [];
    });

  it('no bypass/skipApproval/force option exists in core', () => {
    const offenders = files(SRC).filter((f) =>
      /\b(bypass|skipApproval|skip_approval|force)\b/i.test(
        readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
