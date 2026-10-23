import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  BillingResponse,
  BuildLogsResponse,
  ErrorBody,
  EventsResponse,
  MeResponse,
  MetricSeriesResponse,
  MetricsSummaryResponse,
  NetworksResponse,
  ProjectResponse,
  ProjectsResponse,
  ReleaseResponse,
  ReleasesResponse,
  V1LogsResponse,
  V2LogEntry,
  V2LogsResponse,
} from './schemas.js';

const DIR = resolve(import.meta.dirname, '../../test/fixtures/liara');

/** Every recorded fixture must have a schema; a new fixture without one fails the coverage test. */
const SCHEMA_BY_FIXTURE: Record<string, z.ZodType> = {
  'v1-me': MeResponse,
  'v1-billing': BillingResponse,
  'v1-networks': NetworksResponse,
  'v1-projects': ProjectsResponse,
  'v1-project': ProjectResponse,
  'v1-project-logs': V1LogsResponse,
  'v1-project-logs-iso': ErrorBody,
  'v2-project-logs': V2LogsResponse,
  'v1-project-events': EventsResponse,
  'v1-project-releases': ReleasesResponse,
  'v1-project-metrics-summary': MetricsSummaryResponse,
  'v1-project-metrics-cpu': MetricSeriesResponse,
  'v1-project-metrics-memory': MetricSeriesResponse,
  'v1-release': ReleaseResponse,
  'v2-release-build-logs': BuildLogsResponse,
};

function fixtureBody(name: string): unknown {
  return (JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8')) as { body: unknown }).body;
}

describe('Liara response schemas parse the recorded fixtures', () => {
  it('every fixture has a schema', () => {
    const names = readdirSync(DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length));
    expect(names.filter((n) => !(n in SCHEMA_BY_FIXTURE))).toEqual([]);
  });

  for (const [name, schema] of Object.entries(SCHEMA_BY_FIXTURE)) {
    it(name, () => {
      const result = schema.safeParse(fixtureBody(name));
      expect(result.error?.issues ?? []).toEqual([]);
    });
  }

  it('keeps unknown fields (loose objects)', () => {
    const parsed = NetworksResponse.parse({
      networks: [{ _id: 'n1', name: 'net', createdAt: 'x', futureField: 1 }],
      extra: true,
    });
    expect(parsed).toMatchObject({ extra: true, networks: [{ futureField: 1 }] });
  });

  it('v2 log values decode to entries', () => {
    const { data } = V2LogsResponse.parse(fixtureBody('v2-project-logs'));
    const entries = data.flatMap((g) =>
      g.values.map(([, raw]) => V2LogEntry.parse(JSON.parse(raw))),
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.type === 'stderr')).toBe(true);
  });

  it('plan catalog is keyed by planID, bundles by bundlePlanID', () => {
    const { plans } = MeResponse.parse(fixtureBody('v1-me'));
    expect(plans.projects['small-g2']?.RAM.amount).toBe(0.5);
    expect(Object.keys(plans.projectBundlePlans['small-g2'] ?? {})).toEqual([
      'free',
      'basic',
      'standard',
      'pro',
    ]);
  });

  it('rejects a body missing a required field', () => {
    expect(ProjectsResponse.safeParse({ projects: [{ name: 'x' }] }).success).toBe(false);
  });
});
