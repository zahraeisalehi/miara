// Test harness: the real MCP server over an in-memory transport, on core's offline test core.
import { makeTestCore } from '@miara/core/testing';
import type { TestCoreOptions } from '@miara/core/testing';
import { Client } from '@modelcontextprotocol/client';
import type { CallToolResult, ElicitResult } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createApprovalCodec } from '../src/approval.js';
import { createMiaraMcpServer } from '../src/server.js';

export type Elicit = (message: string, schema: unknown) => ElicitResult | Promise<ElicitResult>;

export interface HarnessOptions extends TestCoreOptions {
  /** When set, the client advertises elicitation and answers with this handler. */
  elicit?: Elicit;
  /** legacy = a 2025-era initialize (what Claude Code speaks today); modern = 2026-07-28 multi-round-trip. */
  era?: 'legacy' | 'modern';
  /** Modern only: surface input_required to the test instead of auto-fulfilling it. */
  manual?: boolean;
}

export async function connect(opts: HarnessOptions = {}) {
  const core = makeTestCore(opts);
  const logs: string[] = [];
  const era = opts.era ?? 'legacy';
  const codec = createApprovalCodec();
  const factory = () => createMiaraMcpServer(core, { codec, log: (l) => logs.push(l) });
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    {
      ...(opts.elicit || opts.manual ? { capabilities: { elicitation: { form: {} } } } : {}),
      ...(era === 'modern' ? { versionNegotiation: { mode: 'auto' as const } } : {}),
      ...(opts.manual ? { inputRequired: { autoFulfill: false } } : {}),
    },
  );
  const elicitations: string[] = [];
  if (opts.elicit) {
    const handler = opts.elicit;
    client.setRequestHandler('elicitation/create', async (req) => {
      const params = req.params as { message: string; requestedSchema?: unknown };
      elicitations.push(params.message);
      return handler(params.message, params.requestedSchema);
    });
  }
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  // serveStdio over a custom transport picks the era from the opening exchange, exactly like production.
  const handle = serveStdio(factory, { transport: serverT });
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  const textOf = (r: CallToolResult) =>
    r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  return { core, client, handle, codec, call, textOf, logs, elicitations };
}
