// The policy gate (D5, D19). The only code path that runs a tool handler.
//   propose → tier 0–1 runs now (visible on the timeline); tier ≥ 2 stores a pending approval.
//   approve → the human step (web card or MCP elicitation). Never a tool, never callable by the LLM.
//   execute → consumes an approved token atomically, then runs the handler.
// Nothing can skip approval, and nothing ever may (CLAUDE.md non-negotiable 2).
import { randomUUID } from 'node:crypto';

import { redactDeep } from '../redact/index.js';
import type { Timeline } from '../timeline/operation.js';
import type { Actor } from '../timeline/types.js';
import { createToolRegistry, maskSensitive } from '../tools/registry.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { AnyToolDef, CostPreview, Tier, ToolContext } from '../tools/types.js';

import { checkBreaker } from './breaker.js';
import { PolicyError } from './errors.js';
import { argsHash } from './hash.js';
import { APPROVERS } from './store.js';
import type { ApprovalRow, ApprovalStore, Approver, Escalation } from './store.js';

export const APPROVAL_TTL_MS = 10 * 60 * 1000;

export interface PendingApproval {
  id: string;
  tool: string;
  app: string | null;
  /** Sensitive paths masked. */
  args: unknown;
  argsHash: string;
  tier: Tier;
  escalation: Escalation | null;
  costPreview: CostPreview | null;
  /** Tier 3: what the human must type at approve. */
  confirmationHint: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
}

export type ProposeResult =
  | { kind: 'result'; tier: Tier; operationId: string; result: unknown }
  | { kind: 'pending_approval'; approval: PendingApproval };

export interface GateOptions {
  tools: readonly AnyToolDef[];
  store: ApprovalStore;
  timeline: Timeline;
  ctx: ToolContext;
  secrets: readonly string[];
}

export interface PolicyGate {
  /** Metadata only; handlers are not reachable through it. */
  registry: ToolRegistry;
  propose(tool: string, rawArgs: unknown, opts: { actor: Actor }): Promise<ProposeResult>;
  approve(
    approvalId: string,
    opts: { approver: Approver; typedConfirmation?: string },
  ): Promise<PendingApproval>;
  execute(
    approvalId: string,
    opts: { actor: Actor; args?: unknown },
  ): Promise<{ kind: 'result'; tier: Tier; operationId: string; result: unknown }>;
  getApproval(approvalId: string): Promise<PendingApproval | undefined>;
  listPending(): Promise<PendingApproval[]>;
}

const maxTier = (...tiers: Tier[]): Tier => Math.max(...tiers) as Tier;

export function createPolicyGate(opts: GateOptions): PolicyGate {
  const defs = new Map(opts.tools.map((d) => [d.name, d]));
  const registry = createToolRegistry(opts.tools);
  const { store, timeline, ctx } = opts;

  function toolOf(name: string): AnyToolDef {
    const def = defs.get(name);
    if (!def) throw new PolicyError('unknown_tool', { tool: name });
    return def;
  }

  async function parseAndPrepare(def: AnyToolDef, rawArgs: unknown): Promise<unknown> {
    const parsed = def.input.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      throw new PolicyError(
        'invalid_args',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return def.prepare ? def.prepare(parsed.data, ctx) : parsed.data;
  }

  async function effectiveTier(
    def: AnyToolDef,
    args: unknown,
    app: string | undefined,
  ): Promise<{ tier: Tier; escalation: Escalation | null }> {
    let tier = def.tier;
    if (def.tierFor) {
      try {
        tier = maxTier(tier, await def.tierFor(args, ctx));
      } catch {
        tier = maxTier(tier, 2); // fail closed
      }
    }
    if (tier === 1 && def.breaker && app) {
      const escalation = await checkBreaker(timeline.sink, def.breaker, def.name, app, ctx.now());
      if (escalation) return { tier: 2, escalation };
    }
    return { tier, escalation: null };
  }

  const masked = (def: AnyToolDef | undefined, args: unknown) =>
    maskSensitive(args, def?.sensitive ?? []);

  function view(row: ApprovalRow): PendingApproval {
    return {
      id: row.id,
      tool: row.tool,
      app: row.app,
      args: masked(defs.get(row.tool), row.args),
      argsHash: row.argsHash,
      tier: row.tier,
      escalation: row.escalation,
      costPreview: row.costPreview,
      confirmationHint: row.confirmationText,
      expiresAt: row.expiresAt,
      approvedAt: row.approvedAt,
    };
  }

  async function run(
    def: AnyToolDef,
    args: unknown,
    tier: Tier,
    actor: Actor,
    mode: 'read' | 'auto' | 'approved',
    operationId?: string,
  ) {
    const app = def.appOf?.(args);
    const reconcile = def.reconcile;
    let opId = '';
    const result = await timeline.withOperation(
      {
        ...(operationId ? { operationId } : {}),
        tool: def.name,
        app,
        tier,
        mode,
        actor,
        labelFa: def.description.fa,
        labelEn: def.description.en,
        data: { args: masked(def, args) },
      },
      async (id) => {
        opId = id;
        return def.handler(args, ctx);
      },
      reconcile ? () => reconcile(args, ctx) : undefined,
    );
    // Nothing leaves core unredacted: env values, secrets, IPs.
    return {
      kind: 'result' as const,
      tier,
      operationId: opId,
      result: redactDeep(result, opts.secrets),
    };
  }

  /** Explains why a compare-and-set updated nothing. */
  async function refusal(id: string, step: 'approve' | 'execute'): Promise<PolicyError> {
    const row = await store.get(id);
    if (!row) return new PolicyError('not_found');
    if (row.usedAt) return new PolicyError('used');
    if (row.expiresAt <= ctx.now()) return new PolicyError('expired');
    if (step === 'approve') {
      if (row.approvedAt) return new PolicyError('already_approved');
      return new PolicyError('wrong_confirmation');
    }
    if (!row.approvedAt) return new PolicyError('not_approved');
    return new PolicyError('tampered');
  }

  return {
    registry,

    async propose(name, rawArgs, { actor }) {
      const def = toolOf(name);
      const args = await parseAndPrepare(def, rawArgs);
      const app = def.appOf?.(args);
      const { tier, escalation } = await effectiveTier(def, args, app);

      if (tier <= 1) return run(def, args, tier, actor, tier === 0 ? 'read' : 'auto');

      const now = ctx.now();
      const row = {
        id: randomUUID(),
        tool: def.name,
        app: app ?? null,
        args,
        argsHash: argsHash(def.name, args),
        tier,
        escalation,
        costPreview: tier >= 3 && def.costPreview ? await def.costPreview(args, ctx) : null,
        confirmationText: tier >= 3 && def.confirmationText ? def.confirmationText(args) : null,
        actor,
        createdAt: now,
        expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
      };
      await store.insert(row);
      await timeline.write({
        operationId: row.id,
        type: 'info',
        status: 'info',
        tool: def.name,
        app,
        tier,
        actor,
        messageFa: `${def.description.fa}: منتظر تأیید شما`,
        messageEn: `${def.description.en}: waiting for approval`,
        data: { approvalId: row.id, args: masked(def, args), escalation },
      });
      return {
        kind: 'pending_approval',
        approval: view({ ...row, approvedAt: null, approvedBy: null, usedAt: null }),
      };
    },

    async approve(approvalId, { approver, typedConfirmation }) {
      if (!APPROVERS.includes(approver)) throw new PolicyError('invalid_approver');
      const ok = await store.approve(approvalId, approver, typedConfirmation?.trim() ?? null);
      if (!ok) throw await refusal(approvalId, 'approve');
      const row = await store.get(approvalId);
      if (!row) throw new PolicyError('not_found');
      await timeline.write({
        operationId: row.id,
        type: 'info',
        status: 'info',
        tool: row.tool,
        app: row.app ?? undefined,
        tier: row.tier,
        actor: approver === 'web-user' ? 'web' : 'mcp',
        messageFa: 'کاربر این کار را تأیید کرد.',
        messageEn: 'The user approved this action.',
        data: { approvalId: row.id, approver },
      });
      return view(row);
    },

    async execute(approvalId, { actor, args: callerArgs }) {
      const row = await store.get(approvalId);
      if (!row) throw new PolicyError('not_found');
      if (row.args === null) throw new PolicyError('used');
      const def = toolOf(row.tool);

      // The stored args must still hash to what was approved (DB tampering).
      const stored = argsHash(row.tool, row.args);
      if (stored !== row.argsHash) throw new PolicyError('tampered');
      // MCP path: the caller resends args; they must be exactly what was approved.
      if (callerArgs !== undefined) {
        const prepared = await parseAndPrepare(def, callerArgs);
        if (argsHash(row.tool, prepared) !== row.argsHash) throw new PolicyError('tampered');
      }

      const consumed = await store.consume(approvalId, stored);
      if (!consumed) throw await refusal(approvalId, 'execute');
      // Fail closed if the row changed between the read and the consume.
      if (argsHash(consumed.tool, consumed.args) !== consumed.argsHash) {
        throw new PolicyError('tampered');
      }
      try {
        return await run(def, consumed.args, consumed.tier, actor, 'approved', consumed.id);
      } finally {
        await store.clearArgs(consumed.id);
      }
    },

    async getApproval(approvalId) {
      const row = await store.get(approvalId);
      return row ? view(row) : undefined;
    },

    async listPending() {
      return (await store.listPending()).map(view);
    },
  };
}
