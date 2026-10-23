import { describe, expect, it } from 'vitest';

import { TEST_APP } from '@miara/core/testing';

import { connect } from './harness.js';

const ID = /approvalId: ([0-9a-f-]{36})/;
const idOf = (text: string) => {
  const m = ID.exec(text);
  if (!m?.[1]) throw new Error(`no approval id in: ${text}`);
  return m[1];
};

const accept = (content: Record<string, unknown>) => () => ({
  action: 'accept' as const,
  content: content as Record<string, string | number | boolean>,
});

describe('tools/list', () => {
  it('exposes every registry tool plus run_approved, with schemas, hints and fa + en text', async () => {
    const h = await connect();
    const { tools } = await h.client.listTools();
    const names = tools.map((t) => t.name).sort();
    const registry = h.core.registry.list().map((t) => t.name);
    expect(names).toEqual([...registry, 'run_approved'].sort());
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.description).toMatch(/[؀-ۿ]/); // Persian
      expect(t.description).toMatch(/[A-Za-z]/);
    }
    for (const info of h.core.registry.list()) {
      const t = tools.find((x) => x.name === info.name);
      expect(t?.annotations?.readOnlyHint).toBe(info.tier === 0);
      expect(t?.description).toContain(`Tier ${info.tier}`);
    }
    const destructive = tools.filter(
      (t) => t.annotations?.destructiveHint && t.name !== 'run_approved',
    );
    expect(destructive.map((t) => t.name).sort()).toEqual(['change_plan', 'create_app']);
  });

  it('offers no way for the agent to approve', async () => {
    const h = await connect();
    const { tools } = await h.client.listTools();
    for (const t of tools) {
      expect(t.name).not.toMatch(/(^|_)(approve|confirm|grant|allow|authorize)(_|$)/);
      const props = Object.keys((t.inputSchema.properties ?? {}) as Record<string, unknown>);
      expect(props).not.toContain('approver');
      expect(props).not.toContain('typedConfirmation');
      // Descriptions may say what a *human* does, never invite the agent to approve.
      expect(t.description ?? '').not.toMatch(/\b(you can|you may|call this to) approve\b/i);
    }
  });
});

describe('tier 0 and 1', () => {
  it('list_apps returns a summary line, then data', async () => {
    const h = await connect();
    const text = h.textOf(await h.call('list_apps'));
    const [head, json] = text.split('\n');
    expect(head).toMatch(/^2 apps: .*miara-something \(ACTIVE, small-g2\/basic\)/);
    expect(JSON.parse(json ?? '')).toHaveLength(2);
  });

  it('get_logs is capped, newest last, one line each', async () => {
    const h = await connect();
    const text = h.textOf(await h.call('get_logs', { app: TEST_APP }));
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/log lines \(v2\) for miara-something, last \d+ shown, newest last/);
    const stamps = lines.slice(1).map((l) => l.split(' ')[0] ?? '');
    expect([...stamps].sort()).toEqual(stamps);
    expect(lines.length - 1).toBeLessThanOrEqual(100);
  });

  it('restart_app runs automatically with exactly one Liara write', async () => {
    const h = await connect();
    const r = await h.call('restart_app', { app: TEST_APP });
    expect(r.isError).toBeFalsy();
    expect(h.textOf(r)).toMatch(/^restart_app miara-something: done \(tier 1, auto\)/);
    expect(h.core.writes()).toHaveLength(1);
  });
});

describe('tier ≥ 2 without elicitation', () => {
  it('power off returns pending_approval with the terminal fallback and writes nothing', async () => {
    const h = await connect();
    const text = h.textOf(await h.call('set_app_power', { app: TEST_APP, on: false }));
    expect(text).toMatch(/^pending_approval: set_app_power miara-something .*tier 2/);
    expect(text).toContain(`pnpm miara approve ${idOf(text)}`);
    expect(text).toContain('run_approved');
    expect(text).toMatch(/expires \d{4}-/);
    expect(text).toMatch(/Never run that command yourself/);
    expect(h.core.writes()).toHaveLength(0);
  });

  it('change_plan shows the cost and the typed-name step', async () => {
    const h = await connect();
    const text = h.textOf(await h.call('change_plan', { app: TEST_APP, planID: 'medium-g2' }));
    expect(text).toMatch(/tier 3/);
    expect(text).toMatch(/Cost: Monthly cost incl\. VAT goes from/);
    expect(text).toContain(`type the app name "${TEST_APP}"`);
    expect(h.core.writes()).toHaveLength(0);
  });
});

describe('run_approved', () => {
  it('is refused before approval, then runs exactly once', async () => {
    const h = await connect();
    const id = idOf(h.textOf(await h.call('set_app_power', { app: TEST_APP, on: false })));

    const before = await h.call('run_approved', { approvalId: id });
    expect(before.isError).toBe(true);
    expect(h.textOf(before)).toMatch(/policy:not_approved/);
    expect(h.textOf(before)).toMatch(/fa: /);

    await h.core.policy.approve(id, { approver: 'cli-user' });
    const done = await h.call('run_approved', { approvalId: id });
    expect(h.textOf(done)).toMatch(/^set_app_power miara-something: done \(tier 2, approved\)/);
    expect(h.core.writes()).toHaveLength(1);

    const again = await h.call('run_approved', { approvalId: id });
    expect(h.textOf(again)).toMatch(/policy:used/);
    expect(h.core.writes()).toHaveLength(1);
  });
});

describe.each(['legacy', 'modern'] as const)('elicitation (%s era)', (era) => {
  it('accept on tier 2 runs the action', async () => {
    const h = await connect({ era, elicit: accept({ approve: true }) });
    const r = await h.call('set_app_power', { app: TEST_APP, on: false });
    expect(h.textOf(r)).toMatch(/done \(tier 2, approved\)/);
    expect(h.elicitations[0]).toMatch(/set_app_power/);
    expect(h.core.writes()).toHaveLength(1);
    const approved = h.core.sink.events.find(
      (e) => e.messageEn === 'The user approved this action.',
    );
    expect(approved?.data).toMatchObject({ approver: 'mcp-elicitation' });
  });

  it('accept with the right app name runs a tier-3 action', async () => {
    const h = await connect({ era, elicit: accept({ confirmation: TEST_APP }) });
    const r = await h.call('change_plan', { app: TEST_APP, planID: 'medium-g2' });
    expect(h.textOf(r)).toMatch(/done \(tier 3, approved\)/);
    expect(h.elicitations[0]).toMatch(/تومان/);
    expect(h.core.writes().map((c) => c.path)).toEqual([`/v1/projects/${TEST_APP}/resize`]);
  });

  it('a wrong app name stays pending', async () => {
    const h = await connect({ era, elicit: accept({ confirmation: 'other-app' }) });
    const text = h.textOf(await h.call('change_plan', { app: TEST_APP, planID: 'medium-g2' }));
    expect(text).toMatch(/^pending_approval/);
    expect(text).toMatch(/did not match/);
    expect(h.core.writes()).toHaveLength(0);
  });

  it.each(['decline', 'cancel'] as const)(
    '%s stays pending and run_approved is refused',
    async (action) => {
      const h = await connect({ era, elicit: () => ({ action }) });
      const text = h.textOf(await h.call('set_app_power', { app: TEST_APP, on: false }));
      expect(text).toMatch(/did not approve/);
      const r = await h.call('run_approved', { approvalId: idOf(text) });
      expect(h.textOf(r)).toMatch(/not_approved/);
      expect(h.core.writes()).toHaveLength(0);
    },
  );
});

describe('requestState integrity (modern, manual client)', () => {
  async function firstRound() {
    const h = await connect({ era: 'modern', manual: true });
    const args = { app: TEST_APP, on: false };
    const r = (await h.client.callTool(
      { name: 'set_app_power', arguments: args },
      { allowInputRequired: true },
    )) as unknown as { requestState?: string; inputRequests?: Record<string, unknown> };
    expect(r.requestState).toBeTypeOf('string');
    return { h, args, state: r.requestState ?? '' };
  }
  const answer = { approval: { action: 'accept', content: { approve: true } } };
  // A retried round carries inputResponses + requestState (2026-07-28 MRTR); the typed params omit them.
  const retry = (h: Awaited<ReturnType<typeof connect>>, params: Record<string, unknown>) =>
    h.client.callTool(params as unknown as Parameters<typeof h.client.callTool>[0]);

  it('a forged requestState is refused before the handler runs', async () => {
    const { h, args, state } = await firstRound();
    const forged = `${state.slice(0, -4)}AAAA`;
    await expect(
      retry(h, {
        name: 'set_app_power',
        arguments: args,
        inputResponses: answer,
        requestState: forged,
      }),
    ).rejects.toThrow(/requestState/);
    expect(h.core.writes()).toHaveLength(0);
  });

  it('a valid state replayed with other args is refused as tampered', async () => {
    const { h, state } = await firstRound();
    const r = await retry(h, {
      name: 'set_app_power',
      arguments: { app: 'wallexer', on: false },
      inputResponses: answer,
      requestState: state,
    });
    expect(h.textOf(r)).toMatch(/policy:tampered/);
    expect(h.core.writes()).toHaveLength(0);
  });

  it('a valid state replayed on another tool is refused as tampered', async () => {
    const { h, state } = await firstRound();
    const r = await retry(h, {
      name: 'restart_app',
      arguments: { app: TEST_APP },
      inputResponses: answer,
      requestState: state,
    });
    expect(h.textOf(r)).toMatch(/policy:tampered/);
    expect(h.core.writes()).toHaveLength(0);
  });
});

describe('errors', () => {
  it('invalid args come back as an error without a stack trace', async () => {
    const h = await connect();
    const r = await h.call('get_app', {});
    expect(r.isError).toBe(true);
    expect(h.textOf(r)).not.toMatch(/\n\s+at /);
  });

  it('a Liara 404 comes back as fa/en text', async () => {
    const h = await connect({
      routes: { 'GET /v1/projects/nope': { status: 404, body: { message: 'not found' } } },
    });
    const r = await h.call('get_app', { app: 'nope' });
    expect(r.isError).toBe(true);
    const text = h.textOf(r);
    expect(text).toMatch(/^error liara:not_found/);
    expect(text).toMatch(/fa: پیدا نشد/);
    expect(text).not.toMatch(/\n\s+at /);
  });
});
