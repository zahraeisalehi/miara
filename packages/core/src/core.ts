// Wires core together for apps/mcp, apps/web and apps/worker. Tool definitions stay inside: callers get the
// registry (metadata) and the policy gate, so the gate is the only way to run a tool.
import type { CoreConfig } from './config.js';
import { secretsOf } from './config.js';
import { createDb } from './db/client.js';
import { createPgApprovalStore } from './db/approval-store.js';
import { createPgIncidentReader } from './db/incidents.js';
import { createPgTimelineSink } from './db/timeline-sink.js';
import { createLiaraClient } from './liara/client.js';
import { createOpenAICompatibleProvider } from './llm/openai-compatible.js';
import { createPolicyGate } from './policy/gate.js';
import { parseAppScope } from './policy/scope.js';
import { createHttpProbe } from './probe/index.js';
import { createTimeline } from './timeline/operation.js';
import { handoffTools } from './tools/handoff.js';
import { readTools } from './tools/read.js';
import { writeTools } from './tools/write.js';

export function createMiaraCore(config: CoreConfig) {
  const secrets = secretsOf(config);
  const now = () => new Date();
  const scope = parseAppScope(config.appScope);
  const database = createDb(config.databaseUrl);
  const timeline = createTimeline({ sink: createPgTimelineSink(database.db), secrets, now });
  const liara = createLiaraClient({
    token: config.liaraToken,
    teamId: config.liaraTeamId,
    secrets,
  });
  const policy = createPolicyGate({
    tools: [...readTools, ...writeTools, ...handoffTools],
    store: createPgApprovalStore(database.db),
    timeline,
    ctx: {
      liara,
      incidents: createPgIncidentReader(database.db),
      scope,
      now,
      probe: createHttpProbe(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    },
    secrets,
  });
  const llm = createOpenAICompatibleProvider({
    apiKey: config.boxapiKey,
    model: config.boxapiModel,
    secrets,
    timeline,
  });
  return {
    liara,
    registry: policy.registry,
    policy,
    scope,
    timeline,
    llm,
    db: database.db,
    close: database.close,
  };
}

export type MiaraCore = ReturnType<typeof createMiaraCore>;
