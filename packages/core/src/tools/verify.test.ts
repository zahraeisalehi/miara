// restart_app's verify step on the offline test core: success only when a new container is up and the public
// address answers; otherwise a VerifyError and a failure on the timeline.
import { describe, expect, it } from 'vitest';

import { makeTestCore, probeAnswer, TEST_APP } from '../../test/helpers/fake-core.js';
import type { ProbeResult } from '../probe/index.js';

import { VERIFY_ATTEMPTS } from './verify.js';

const dnsFailure: ProbeResult = {
  url: `https://${TEST_APP}.liara.run/health`,
  reachable: false,
  healthy: false,
  latencyMs: 3,
  failure: 'dns',
  messageFa: 'dns',
  messageEn: "The app's address does not resolve (DNS).",
};

const statuses = (core: ReturnType<typeof makeTestCore>) =>
  core.sink.events.filter((e) => e.tool === 'restart_app').map((e) => e.status);

describe('restart_app verify', () => {
  it('succeeds after a fresh container start and a healthy probe, with metrics re-read', async () => {
    const paths: string[] = [];
    const core = makeTestCore({
      probe: async (_app, path) => {
        paths.push(path);
        return probeAnswer(200);
      },
    });
    const r = await core.policy.propose('restart_app', { app: TEST_APP }, { actor: 'mcp' });
    expect(r.kind).toBe('result');
    expect(r.kind === 'result' && r.result).toMatchObject({
      app: TEST_APP,
      verify: { verified: true, httpChecked: true, app: { status: 'ACTIVE', started: true } },
    });
    expect(
      r.kind === 'result' && (r.result as { verify: { metrics?: unknown } }).verify.metrics,
    ).toBeDefined();
    expect(paths).toEqual(['/health']);
    expect(statuses(core)).toEqual(['start', 'success']);
  });

  it('probes the given healthPath', async () => {
    const paths: string[] = [];
    const core = makeTestCore({
      probe: async (_app, path) => {
        paths.push(path);
        return probeAnswer(200);
      },
    });
    await core.policy.propose('restart_app', { app: TEST_APP, healthPath: '/' }, { actor: 'mcp' });
    expect(paths).toEqual(['/']);
  });

  it('a public name that does not resolve yet still verifies, marked httpChecked: false', async () => {
    const core = makeTestCore({ probe: async () => dnsFailure });
    const r = await core.policy.propose('restart_app', { app: TEST_APP }, { actor: 'mcp' });
    expect(r.kind === 'result' && r.result).toMatchObject({
      verify: { verified: true, httpChecked: false },
    });
  });

  it('keeps polling while the app answers 502, then fails with a VerifyError and a failure event', async () => {
    let probes = 0;
    const core = makeTestCore({
      probe: async () => {
        probes += 1;
        return probeAnswer(502, 'Bad Gateway');
      },
    });
    await expect(
      core.policy.propose('restart_app', { app: TEST_APP }, { actor: 'mcp' }),
    ).rejects.toMatchObject({ name: 'VerifyError' });
    expect(probes).toBe(VERIFY_ATTEMPTS);
    expect(statuses(core)).toEqual(['start', 'failure']);
    const failure = core.sink.events.find((e) => e.status === 'failure');
    expect(failure?.errorExplanationFa).toMatch(/ری‌استارت ارسال شد/);
    expect(core.writes()).toHaveLength(1); // never re-sent
  });

  it('a 502 that turns healthy on a later poll verifies', async () => {
    let probes = 0;
    const core = makeTestCore({
      probe: async () => (++probes < 3 ? probeAnswer(502) : probeAnswer(200)),
    });
    const r = await core.policy.propose('restart_app', { app: TEST_APP }, { actor: 'mcp' });
    expect(r.kind === 'result' && r.result).toMatchObject({
      verify: { verified: true, attempts: 3 },
    });
  });

  it('fails when no new container starts (events show only the old ones)', async () => {
    let probes = 0;
    const core = makeTestCore({
      routes: { [`POST /v1/projects/${TEST_APP}/actions/restart`]: { status: 200 } },
      probe: async () => {
        probes += 1;
        return probeAnswer(200);
      },
    });
    await expect(
      core.policy.propose('restart_app', { app: TEST_APP }, { actor: 'mcp' }),
    ).rejects.toMatchObject({ messageEn: expect.stringMatching(/no new container came up/) });
    expect(probes).toBe(0);
  });
});
