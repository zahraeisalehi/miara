// The Miara MCP server: every core tool, exposed through the same policy gate (a thin wrapper, no business logic).
// Tier 0–1 run now; tier ≥ 2 ask the human via elicitation when the client supports it, else return
// `pending_approval` with the terminal fallback. `run_approved` only executes what a human already approved.
import type { tools } from '@miara/core';
import { policy, redact } from '@miara/core';
import {
  CLIENT_CAPABILITIES_META_KEY,
  fromJsonSchema,
  McpServer,
} from '@modelcontextprotocol/server';
import type {
  CallToolResult,
  InputRequiredResult,
  JsonSchemaType,
  ServerContext,
  ToolAnnotations,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

import {
  askForApproval,
  createApprovalCodec,
  readAnswer,
  supportsElicitation,
} from './approval.js';
import type { ApprovalCodec } from './approval.js';
import { formatError, formatPending, formatResult } from './format.js';

export const SERVER_NAME = 'miara';
export const SERVER_VERSION = '0.1.0';

/** What the server needs from core: the gate (which owns the registry). */
export interface McpCore {
  policy: policy.PolicyGate;
}

export interface MiaraMcpOptions {
  /** Shared across connections in one process, so every elicitation round verifies. */
  codec?: ApprovalCodec;
  /** Values scrubbed from anything written to stderr. */
  secrets?: readonly string[];
  log?: (line: string) => void;
}

export const INSTRUCTIONS = [
  'Miara is an SRE copilot for Liara (liara.ir). Use only Miara tools for anything on Liara.',
  "Routine operations run automatically and are logged on Miara's timeline: reads, restart, deploy, set env, power on.",
  'Risky ones (power off, create app, change plan, deletes, or a routine op over its hourly limit) need a human.',
  'Miara then asks the human directly (an elicitation prompt), or returns pending_approval: the human approves with',
  '`pnpm miara approve <id>` in their own terminal, and you then call run_approved. Never run `pnpm miara approve`',
  'yourself and never ask the user to paste a confirmation to you.',
  'Never invent Liara endpoints, plan IDs or bundle IDs: get them from list_plans and list_networks.',
  'After any corrective action, verify it with get_app, get_events and get_logs, and report the outcome.',
  'Lines starting with "fa:" are Persian text for the user; the rest is for you.',
].join('\n');

function tierLine(info: tools.ToolInfo): string {
  if (info.tier === 0) return 'Tier 0: read-only.';
  if (info.tier === 1) {
    return info.dynamicTier
      ? "Tier 1: runs automatically and is logged; it can need a human's approval (over the hourly limit, or risky arguments)."
      : 'Tier 1: runs automatically and is logged.';
  }
  return `Tier ${info.tier}: needs a human's approval${info.tier === 3 ? ' (they type the app name; cost is shown)' : ''}.`;
}

function annotations(info: tools.ToolInfo): ToolAnnotations {
  return {
    title: info.description.en,
    readOnlyHint: info.tier === 0,
    destructiveHint: info.tier === 3,
    idempotentHint: info.tier === 0,
    openWorldHint: true,
  };
}

const ApprovalStateSchema = z.object({
  approvalId: z.string(),
  tool: z.string(),
  argsHash: z.string(),
});

export function createMiaraMcpServer(core: McpCore, opts: MiaraMcpOptions = {}): McpServer {
  const codec = opts.codec ?? createApprovalCodec();
  const log = opts.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const secrets = opts.secrets ?? [];
  const gate = core.policy;

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
      requestState: { verify: (state, ctx) => codec.verify(state, ctx) },
    },
  );

  /** 2026 era: the request's own envelope; 2025 era: what initialize declared. */
  function clientCapabilities(ctx: ServerContext): { elicitation?: unknown } | undefined {
    const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
    const fromEnvelope = envelope?.[CLIENT_CAPABILITIES_META_KEY];
    if (typeof fromEnvelope === 'object' && fromEnvelope !== null) return fromEnvelope;
    return server.server.getClientCapabilities();
  }

  function fail(err: unknown): CallToolResult {
    const { result, explained } = formatError(err);
    if (!explained) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      log(`[miara-mcp] unexpected error: ${redact.redactString(message, secrets)}`);
    }
    return result;
  }

  /** Re-entry after the human answered the elicitation. */
  async function resume(
    name: string,
    args: unknown,
    rawState: unknown,
    ctx: ServerContext,
  ): Promise<CallToolResult> {
    const state = ApprovalStateSchema.parse(rawState);
    const approval = await gate.getApproval(state.approvalId);
    if (!approval || approval.tool !== name || approval.argsHash !== state.argsHash) {
      throw new policy.PolicyError('tampered');
    }
    const answer = readAnswer(approval.tier, ctx.mcpReq.inputResponses);
    if (!answer.approved) {
      return formatPending(approval, {
        en: 'The human did not approve in the prompt; it stays pending until it expires.',
        fa: 'در پنجره‌ی تأیید، تأیید نشد؛ تا پایان مهلت در انتظار می‌ماند.',
      });
    }
    try {
      await gate.approve(approval.id, {
        approver: 'mcp-elicitation',
        ...(answer.typedConfirmation !== undefined
          ? { typedConfirmation: answer.typedConfirmation }
          : {}),
      });
    } catch (err) {
      if (err instanceof policy.PolicyError && err.kind === 'wrong_confirmation') {
        return formatPending(approval, {
          en: 'The typed app name did not match; it is still pending.',
          fa: 'نام تایپ‌شده با نام اپ یکی نبود؛ هنوز در انتظار تأیید است.',
        });
      }
      throw err;
    }
    const done = await gate.execute(approval.id, { actor: 'mcp', args });
    return formatResult(name, done.tier, args, done.result);
  }

  for (const info of gate.registry.list()) {
    server.registerTool(
      info.name,
      {
        title: info.description.en,
        description: `${info.description.en}\n${info.description.fa}\n${tierLine(info)}`,
        inputSchema: fromJsonSchema(info.inputSchema as JsonSchemaType),
        annotations: annotations(info),
      },
      async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
        try {
          const state = ctx.mcpReq.requestState();
          if (state !== undefined) return await resume(info.name, args, state, ctx);
          const r = await gate.propose(info.name, args, { actor: 'mcp' });
          if (r.kind === 'result') return formatResult(info.name, r.tier, args, r.result);
          if (supportsElicitation(clientCapabilities(ctx))) {
            return await askForApproval(codec, r.approval, ctx);
          }
          return formatPending(r.approval);
        } catch (err) {
          return fail(err);
        }
      },
    );
  }

  server.registerTool(
    'run_approved',
    {
      title: 'Run an action a human already approved',
      description: [
        'Runs an action that a human has ALREADY approved (in their terminal with `pnpm miara approve <id>`, or in the Miara web app).',
        'It cannot approve anything: an unapproved, expired or used approval is refused.',
        'اجرای کاری که انسان قبلاً تأیید کرده است؛ این ابزار نمی‌تواند چیزی را تأیید کند.',
      ].join('\n'),
      inputSchema: z.object({ approvalId: z.uuid() }),
      annotations: { title: 'Run approved action', destructiveHint: true, openWorldHint: true },
    },
    async ({ approvalId }) => {
      try {
        const approval = await gate.getApproval(approvalId);
        const done = await gate.execute(approvalId, { actor: 'mcp' });
        return formatResult(
          approval?.tool ?? 'run_approved',
          done.tier,
          approval?.args,
          done.result,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
