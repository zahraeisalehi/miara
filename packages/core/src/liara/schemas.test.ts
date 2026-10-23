import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  BillingResponse,
  BuildLogsResponse,
  DomainsResponse,
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

/**
 * Schema per endpoint template (fixture `request.path`, with 24-hex IDs as `{id}`). Error statuses parse as
 * ErrorBody. Any fixture of a known endpoint is covered automatically, including `live-*.json` captures written by
 * test/live/liara.live.test.ts; a fixture of an unknown endpoint fails the coverage test.
 */
const SCHEMA_BY_PATH: Record<string, z.ZodType> = {
  '/v1/me': MeResponse,
  '/v1/billing': BillingResponse,
  '/v1/networks': NetworksResponse,
  '/v1/projects': ProjectsResponse,
  '/v1/projects/{app}': ProjectResponse,
  '/v1/projects/{app}/logs': V1LogsResponse,
  '/v2/projects/{app}/logs': V2LogsResponse,
  '/v1/projects/{app}/events': EventsResponse,
  '/v1/projects/{app}/releases': ReleasesResponse,
  '/v1/projects/{app}/metrics/summary': MetricsSummaryResponse,
  '/v1/projects/{app}/metrics/cpu': MetricSeriesResponse,
  '/v1/projects/{app}/metrics/memory': MetricSeriesResponse,
  '/v1/releases/{id}': ReleaseResponse,
  '/v2/releases/{id}/build-logs': BuildLogsResponse,
  '/v1/domains': DomainsResponse,
};

interface Fixture {
  request: { path: string };
  status: number;
  body: unknown;
}

const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((file) => ({
    file,
    fixture: JSON.parse(readFileSync(resolve(DIR, file), 'utf8')) as Fixture,
  }));

function schemaFor(f: Fixture): z.ZodType | undefined {
  if (f.status >= 400) return ErrorBody;
  return SCHEMA_BY_PATH[f.request.path.replace(/\/[0-9a-f]{24}(?=\/|$)/g, '/{id}')];
}

function fixtureBody(name: string): unknown {
  return (JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8')) as { body: unknown }).body;
}

describe('Liara response schemas parse the recorded fixtures', () => {
  it('every fixture maps to a schema', () => {
    expect(fixtures.filter(({ fixture }) => !schemaFor(fixture)).map(({ file }) => file)).toEqual(
      [],
    );
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
  });

  for (const { file, fixture } of fixtures) {
    it(file, () => {
      const result = schemaFor(fixture)?.safeParse(fixture.body);
      expect(result?.error?.issues ?? []).toEqual([]);
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
