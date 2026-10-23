import { describe, expect, it } from 'vitest';

import { fixtureBody, fixtureRoutes, ok, testClient } from '../../test/helpers/liara-mock.js';

import { flattenV2, fromV1, getLogs } from './logs.js';
import { V1LogsResponse, V2LogsResponse } from './schemas.js';

const APP = 'miara-something';

describe('logs', () => {
  it('flattens v2 groups and sorts them by timestamp', () => {
    const lines = flattenV2(V2LogsResponse.parse(fixtureBody('v2-project-logs')));
    expect(lines).toHaveLength(14);
    const ts = lines.map((l) => l.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(lines.some((l) => l.message === 'listening on 3000' && l.stream === 'stdout')).toBe(
      true,
    );
    expect(lines.find((l) => l.stream === 'stderr')?.message).toMatch(/^\[error\] boom/);
    // The fixture's groups are not in time order: the oldest line comes from the last group.
    expect(lines[0]?.message).toBe('[info] GET /');
  });

  it('filters the v1 CLI-upgrade notice', () => {
    expect(fromV1(V1LogsResponse.parse(fixtureBody('v1-project-logs')))).toEqual([]);
  });

  it('uses v2 when it works', async () => {
    const { client, calls } = testClient(fixtureRoutes());
    const res = await getLogs(client, APP, 1);
    expect(res.source).toBe('v2');
    expect(calls.map((c) => c.path)).toEqual([`/v2/projects/${APP}/logs`]);
  });

  it('falls back to v1 when v2 fails, still without the notice', async () => {
    const { client } = testClient({
      [`GET /v2/projects/${APP}/logs`]: { status: 404, body: {} },
      [`GET /v1/projects/${APP}/logs`]: {
        status: 200,
        body: [
          ...(fixtureBody('v1-project-logs') as unknown[]),
          { type: 'stdout', datetime: '2026-10-22T17:00:00.000Z', message: 'real line' },
        ],
      },
    });
    const res = await getLogs(client, APP, 1);
    expect(res).toEqual({
      source: 'v1',
      lines: [
        { ts: Date.parse('2026-10-22T17:00:00.000Z'), stream: 'stdout', message: 'real line' },
      ],
    });
  });

  it('does not fall back on a bad token', async () => {
    const { client, calls } = testClient({
      [`GET /v2/projects/${APP}/logs`]: { status: 401, body: {} },
      [`GET /v1/projects/${APP}/logs`]: ok('v1-project-logs'),
    });
    await expect(getLogs(client, APP, 1)).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(calls).toHaveLength(1);
  });
});
