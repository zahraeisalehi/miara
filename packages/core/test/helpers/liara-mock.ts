// Offline Liara: a fetch mock that serves recorded fixtures (test/fixtures/liara/) and records every call.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createLiaraClient } from '../../src/liara/client.js';
import type { FetchLike } from '../../src/liara/http.js';

const FIXTURES = resolve(import.meta.dirname, '../fixtures/liara');

export function fixtureBody(name: string): unknown {
  return (JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as { body: unknown })
    .body;
}

export interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  json?: unknown;
  form?: FormData;
}

export type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;
type Route = (call: RecordedCall) => Reply | undefined;

export const TEST_TOKEN = 'test-liara-token-0123456789';

/** Routes: "METHOD /path" → reply (or a function of the call). Unknown routes are a 599 so tests notice. */
export function mockLiara(routes: Record<string, Reply | Reply[] | Route>) {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, Reply[]>();
  const fetchMock: FetchLike = async (url, init) => {
    const call: RecordedCall = {
      method: init.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: { ...(init.headers as Record<string, string>) },
    };
    if (typeof init.body === 'string') call.json = JSON.parse(init.body);
    if (init.body instanceof FormData) call.form = init.body;
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const route = routes[key];
    let reply: Reply | undefined;
    if (Array.isArray(route)) {
      if (!queues.has(key)) queues.set(key, [...route]);
      const q = queues.get(key) ?? [];
      reply = q.length > 1 ? q.shift() : q[0];
    } else if (typeof route === 'function') reply = route(call);
    else reply = route;
    if (!reply)
      return new Response(JSON.stringify({ message: `no mock for ${key}` }), { status: 599 });
    if (reply instanceof Error) throw reply;
    return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    });
  };
  return { fetch: fetchMock, calls };
}

export const ok = (name: string): Reply => ({ status: 200, body: fixtureBody(name) });

/** Every recorded read fixture, routed with the app name `miara-something`. */
export function fixtureRoutes(app = 'miara-something'): Record<string, Reply> {
  return {
    'GET /v1/me': ok('v1-me'),
    'GET /v1/billing': ok('v1-billing'),
    'GET /v1/networks': ok('v1-networks'),
    'GET /v1/projects': ok('v1-projects'),
    [`GET /v1/projects/${app}`]: ok('v1-project'),
    [`GET /v1/projects/${app}/logs`]: ok('v1-project-logs'),
    [`GET /v2/projects/${app}/logs`]: ok('v2-project-logs'),
    [`GET /v1/projects/${app}/events`]: ok('v1-project-events'),
    [`GET /v1/projects/${app}/releases`]: ok('v1-project-releases'),
    [`GET /v1/projects/${app}/metrics/summary`]: ok('v1-project-metrics-summary'),
    [`GET /v1/projects/${app}/metrics/cpu`]: ok('v1-project-metrics-cpu'),
    [`GET /v1/projects/${app}/metrics/memory`]: ok('v1-project-metrics-memory'),
    'GET /v1/releases/6ada4a5f7ebf55567c84fb56': ok('v1-release'),
    'GET /v2/releases/6ada4a5f7ebf55567c84fb56/build-logs': ok('v2-release-build-logs'),
    // source: spec pass_domains_get-all-domains.md (unverified; no live fixture yet)
    'GET /v1/domains': { status: 200, body: { domains: [] } },
  };
}

export function testClient(
  routes: Record<string, Reply | Reply[] | Route>,
  opts: { teamId?: string } = {},
) {
  const mock = mockLiara(routes);
  const client = createLiaraClient({
    token: TEST_TOKEN,
    ...(opts.teamId ? { teamId: opts.teamId } : {}),
    secrets: [TEST_TOKEN],
    fetch: mock.fetch,
    sleep: async () => {},
  });
  return { client, calls: mock.calls };
}
