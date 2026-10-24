// An offline core for tests: the real policy gate and tools over a mocked Liara (recorded fixtures + write acks),
// a memory approval store, a memory timeline and an in-memory incidents reader. Exported as `@miara/core/testing`
// for test files only (apps/mcp reuses it); nothing here touches the network or Postgres.
import { createPolicyGate } from '../../src/policy/gate.js';
import { parseAppScope } from '../../src/policy/scope.js';
import type { ApprovalStore } from '../../src/policy/store.js';
import { createMemoryApprovalStore } from '../../src/policy/store.js';
import { createMemoryTimelineSink } from '../../src/timeline/memory.js';
import type { HttpProbe, ProbeResult } from '../../src/probe/index.js';
import { createTimeline } from '../../src/timeline/operation.js';
import { handoffTools } from '../../src/tools/handoff.js';
import { readTools } from '../../src/tools/read.js';
import type { Incident } from '../../src/tools/types.js';
import { writeTools } from '../../src/tools/write.js';

import { fixtureRoutes, ok, testClient } from './liara-mock.js';
import type { RecordedCall, Reply } from './liara-mock.js';

export const TEST_APP = 'miara-something';
export const DEFAULT_TEST_SCOPE = 'miara-*,buggy-*';
const ACK: Reply = { status: 200, body: { message: 'ok' } };
/** What a live restart returned (fixture write-v1-projects-app-actions-restart.json): a 2xx with an empty body. */
const EMPTY_OK: Reply = { status: 200 };

export interface TestCoreOptions {
  store?: ApprovalStore;
  /** Extra or overriding Liara routes, "METHOD /path" → reply. */
  routes?: Record<string, Reply | Reply[] | ((call: RecordedCall) => Reply | undefined)>;
  now?: () => Date;
  incidents?: Incident[];
  /** MIARA_APP_SCOPE for the test core. Default `miara-*,buggy-*` (the fixtures also hold `wallexer`, out of scope). */
  appScope?: string;
  /** The public-address probe. Default: every app answers HTTP 200 {"ok":true}. */
  probe?: HttpProbe;
}

/** A probe answer as check_health / verify see it. */
export function probeAnswer(status: number, body = '{"ok":true}'): ProbeResult {
  return {
    url: 'https://test.liara.run/health',
    reachable: true,
    healthy: status < 500,
    status,
    latencyMs: 12,
    body,
    messageFa: `HTTP ${status}`,
    messageEn: `HTTP ${status}`,
  };
}

/** Apps whose restart is followed by a fresh container start (so restart_app's verify step passes). */
const RESTARTABLE_APPS = [TEST_APP, 'miara-other'];

export function makeTestCore(opts: TestCoreOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const store = opts.store ?? createMemoryApprovalStore(now);
  // After a restart, the events feed shows a new container start (newest first), like Liara does.
  const restartedAt = new Map<string, number>();
  const restartRoutes = Object.fromEntries(
    RESTARTABLE_APPS.flatMap((app) => [
      [
        `POST /v1/projects/${app}/actions/restart`,
        () => {
          restartedAt.set(app, Math.floor(now().getTime() / 1000));
          return EMPTY_OK;
        },
      ],
      [
        `GET /v1/projects/${app}/events`,
        (): Reply => {
          const fixture = ok('v1-project-events') as { status: number; body: { data: unknown[] } };
          const t = restartedAt.get(app);
          if (t === undefined) return fixture;
          const id = `restarted-${app}-${t}`;
          const fresh = [
            { id, status: 'start', action: 'start', time: String(t + 2), release: 'r', tag: 'v2' },
            {
              id,
              status: 'create',
              action: 'create',
              time: String(t + 1),
              release: 'r',
              tag: 'v2',
            },
          ];
          return { status: 200, body: { data: [...fresh, ...fixture.body.data] } };
        },
      ],
    ]),
  );
  const { client, calls } = testClient({
    ...fixtureRoutes(TEST_APP),
    'GET /v1/projects/miara-other': ok('v1-project'),
    ...restartRoutes,
    [`POST /v1/projects/${TEST_APP}/actions/scale`]: ACK,
    [`POST /v1/projects/${TEST_APP}/resize`]: ACK,
    'POST /v1/projects/update-envs': ACK,
    ...opts.routes,
  });
  const sink = createMemoryTimelineSink();
  const timeline = createTimeline({ sink, secrets: [], now });
  const incidents = opts.incidents ?? [];
  const policy = createPolicyGate({
    tools: [...readTools, ...writeTools, ...handoffTools],
    store,
    timeline,
    ctx: {
      liara: client,
      incidents: { listOpen: async () => incidents },
      scope: parseAppScope(opts.appScope ?? DEFAULT_TEST_SCOPE),
      now,
      probe: opts.probe ?? (async () => probeAnswer(200)),
      sleep: async () => {},
    },
    secrets: [],
  });
  return {
    policy,
    registry: policy.registry,
    timeline,
    store,
    sink,
    calls,
    /** Liara write calls made so far. */
    writes: () => calls.filter((c) => c.method === 'POST'),
  };
}

export type TestCore = ReturnType<typeof makeTestCore>;
export { syntheticV2Logs } from './v2-log-pages.js';
