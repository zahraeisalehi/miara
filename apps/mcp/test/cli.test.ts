import { PassThrough } from 'node:stream';

import { makeTestCore, TEST_APP } from '@miara/core/testing';
import { describe, expect, it } from 'vitest';

import { runCli } from '../src/cli.js';

function io(answers: string[] = [], isTTY = true) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (d: Buffer) => (out += d.toString()));
  stderr.on('data', (d: Buffer) => (err += d.toString()));
  // Answer each prompt as it appears.
  let i = 0;
  stdout.on('data', () => {
    const next = answers[i];
    if (next !== undefined && /\? $|: $|\] $/.test(out)) {
      i += 1;
      stdin.write(`${next}\n`);
    }
  });
  return { io: { stdin, stdout, stderr, isTTY }, out: () => out, err: () => err };
}

async function pending(core: ReturnType<typeof makeTestCore>, tool: string, args: unknown) {
  const r = await core.policy.propose(tool, args, { actor: 'mcp' });
  if (r.kind !== 'pending_approval') throw new Error('expected pending');
  return r.approval;
}

describe('pnpm miara approvals', () => {
  it('lists pending approvals, masked, with the cost', async () => {
    const core = makeTestCore({
      routes: { 'GET /v1/domains': { status: 200, body: { domains: [{ name: 'shop.ir' }] } } },
    });
    await pending(core, 'set_env', { app: TEST_APP, set: { SECRET_KEY: 'hunter2-value' } });
    await pending(core, 'change_plan', { app: TEST_APP, planID: 'medium-g2' });
    const t = io();
    expect(await runCli(['approvals'], core.policy, t.io)).toBe(0);
    expect(t.out()).toMatch(/2 pending approval/);
    expect(t.out()).not.toContain('hunter2-value');
    expect(t.out()).toMatch(/toman\/month incl\. VAT/);
  });
});

describe('pnpm miara approve', () => {
  it('approves tier 2 on "y" without executing', async () => {
    const core = makeTestCore();
    const a = await pending(core, 'set_app_power', { app: TEST_APP, on: false });
    const t = io(['y']);
    expect(await runCli(['approve', a.id], core.policy, t.io)).toBe(0);
    expect(t.out()).toMatch(/run_approved/);
    expect((await core.policy.getApproval(a.id))?.approvedAt).toBeInstanceOf(Date);
    expect(core.writes()).toHaveLength(0);
  });

  it('refuses a wrong tier-3 name and keeps it pending; the right name approves', async () => {
    const core = makeTestCore();
    const a = await pending(core, 'change_plan', { app: TEST_APP, planID: 'medium-g2' });
    const wrong = io(['wallexer']);
    expect(await runCli(['approve', a.id], core.policy, wrong.io)).toBe(1);
    expect(wrong.err()).toMatch(/Wrong confirmation/);
    expect((await core.policy.getApproval(a.id))?.approvedAt).toBeNull();

    const right = io([TEST_APP]);
    expect(await runCli(['approve', a.id], core.policy, right.io)).toBe(0);
    expect((await core.policy.getApproval(a.id))?.approvedAt).toBeInstanceOf(Date);
  });

  it('refuses without a TTY (a coding agent cannot approve for itself)', async () => {
    const core = makeTestCore();
    const a = await pending(core, 'set_app_power', { app: TEST_APP, on: false });
    const t = io(['y'], false);
    expect(await runCli(['approve', a.id], core.policy, t.io)).toBe(2);
    expect(t.err()).toMatch(/Refused/);
    expect((await core.policy.getApproval(a.id))?.approvedAt).toBeNull();
  });
});
