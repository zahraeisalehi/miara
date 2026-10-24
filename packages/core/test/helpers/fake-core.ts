// An offline core for tests: the real policy gate and tools over a mocked Liara (recorded fixtures + write acks),
// a memory approval store, a memory timeline and an in-memory incidents reader. Exported as `@miara/core/testing`
// for test files only (apps/mcp reuses it); nothing here touches the network or Postgres.
import { createPolicyGate } from '../../src/policy/gate.js';
import { parseAppScope } from '../../src/policy/scope.js';
import type { ApprovalStore } from '../../src/policy/store.js';
import { createMemoryApprovalStore } from '../../src/policy/store.js';
import { createMemoryTimelineSink } from '../../src/timeline/memory.js';
import { createTimeline } from '../../src/timeline/operation.js';
import { handoffTools } from '../../src/tools/handoff.js';
import { readTools } from '../../src/tools/read.js';
import type { Incident } from '../../src/tools/types.js';
import { writeTools } from '../../src/tools/write.js';

import { fixtureRoutes, testClient } from './liara-mock.js';
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
}

export function makeTestCore(opts: TestCoreOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const store = opts.store ?? createMemoryApprovalStore(now);
  const { client, calls } = testClient({
    ...fixtureRoutes(TEST_APP),
    [`POST /v1/projects/${TEST_APP}/actions/restart`]: EMPTY_OK,
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
