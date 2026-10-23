import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { makeTestCore } from '../../test/helpers/fake-core.js';

describe('handoff tools', () => {
  it('get_open_incidents returns the open incidents (empty by default)', async () => {
    const core = makeTestCore();
    const r = await core.policy.propose('get_open_incidents', {}, { actor: 'mcp' });
    expect(r).toMatchObject({ kind: 'result', tier: 0, result: [] });
  });

  it('report_fix records start + success with actor mcp and the summary, touching no Liara state', async () => {
    const core = makeTestCore();
    const incidentId = randomUUID();
    const r = await core.policy.propose(
      'report_fix',
      { incidentId, summary: 'Stop caching every /report body', commit: 'abc1234' },
      { actor: 'mcp' },
    );
    expect(r).toMatchObject({ kind: 'result', tier: 1 });
    const events = core.sink.events.filter((e) => e.tool === 'report_fix');
    expect(events.map((e) => e.status)).toEqual(['start', 'success']);
    expect(events.every((e) => e.actor === 'mcp')).toBe(true);
    expect(JSON.stringify(events[0]?.data)).toContain('Stop caching every /report body');
    expect(core.calls).toHaveLength(0);
  });
});
