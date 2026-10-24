import { describe, expect, it } from 'vitest';

import { fixtureBody, fixtureRoutes, ok, testClient } from '../../test/helpers/liara-mock.js';

import { syntheticV2Logs } from '../../test/helpers/v2-log-pages.js';

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
    // A static page: one fetch, one re-check at the same second, one step past it, then done.
    expect(new Set(calls.map((c) => c.path))).toEqual(new Set([`/v2/projects/${APP}/logs`]));
    expect(res.complete).toBe(true);
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
      complete: true,
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

  describe('newest lines of a long window (v2 pages forward from `start`)', () => {
    const END = Date.parse('2026-10-23T16:00:00Z');
    const now = () => new Date(END + 5_000);
    // 1000 lines over ~1 hour, 100 per page: the first page is the OLDEST 100.
    const logs = syntheticV2Logs({ count: 1000, stepMs: 3_600, endMs: END });
    const since = Math.floor(logs.first / 1000);

    it('follows the pages to the tail and returns the newest N, newest last', async () => {
      const { client, calls } = testClient({ [`GET /v2/projects/${APP}/logs`]: logs.route });
      const res = await getLogs(client, APP, since, { maxLines: 300, now });
      expect(res.complete).toBe(true);
      expect(res.lines).toHaveLength(300);
      expect(res.lines.at(-1)?.message).toBe(logs.message(999));
      expect(res.lines[0]?.message).toBe(logs.message(700));
      const ts = res.lines.map((l) => l.ts);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
      expect(new Set(res.lines.map((l) => l.message)).size).toBe(300); // no duplicates across pages
      expect(calls.length).toBeGreaterThan(10);
      expect(calls.length).toBeLessThan(20);
    });

    it('jumps to the last minutes when the page cap is hit, and says so', async () => {
      const { client } = testClient({ [`GET /v2/projects/${APP}/logs`]: logs.route });
      const res = await getLogs(client, APP, since, { maxLines: 300, maxPages: 3, now });
      expect(res.complete).toBe(false);
      expect(res.lines.at(-1)?.message).toBe(logs.message(999));
      const ts = res.lines.map((l) => l.ts);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
    });

    it('does not loop when more than a page of lines share one second', async () => {
      const burst = syntheticV2Logs({ count: 250, stepMs: 1, endMs: END });
      const { client, calls } = testClient({ [`GET /v2/projects/${APP}/logs`]: burst.route });
      const res = await getLogs(client, APP, Math.floor(burst.first / 1000), { now });
      expect(calls.length).toBeLessThan(10);
      expect(res.lines.length).toBeGreaterThan(0);
    });
  });
});
