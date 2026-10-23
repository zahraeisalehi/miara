// Approval storage. Every state change is one compare-and-set; the Postgres version is db/approval-store.ts.
import type { CostPreview, Tier } from '../tools/types.js';
import type { Actor } from '../timeline/types.js';

export type Approver = 'web-user' | 'mcp-elicitation';
export const APPROVERS: readonly Approver[] = ['web-user', 'mcp-elicitation'];

export interface Escalation {
  reasonFa: string;
  reasonEn: string;
}

export interface ApprovalRow {
  id: string;
  tool: string;
  app: string | null;
  /** Nulled once used, so stored env values don't outlive the approval. */
  args: unknown;
  argsHash: string;
  tier: Tier;
  escalation: Escalation | null;
  costPreview: CostPreview | null;
  confirmationText: string | null;
  actor: Actor;
  createdAt: Date;
  expiresAt: Date;
  approvedAt: Date | null;
  approvedBy: Approver | null;
  usedAt: Date | null;
}

export type NewApproval = Omit<ApprovalRow, 'approvedAt' | 'approvedBy' | 'usedAt'>;

export interface ApprovalStore {
  insert(row: NewApproval): Promise<void>;
  get(id: string): Promise<ApprovalRow | undefined>;
  /**
   * Atomic: sets approved_at/by only if unapproved, unused, unexpired and (tier < 3 or the confirmation matches).
   * Returns false when nothing was updated.
   */
  approve(id: string, approver: Approver, typedConfirmation: string | null): Promise<boolean>;
  /** Atomic: sets used_at only if approved, unused, unexpired and the hash matches. Returns the consumed row. */
  consume(id: string, argsHash: string): Promise<ApprovalRow | undefined>;
  clearArgs(id: string): Promise<void>;
  listPending(): Promise<ApprovalRow[]>;
}

/** In-memory store for tests. JS is single-threaded and each method checks-and-sets without awaiting in between. */
export function createMemoryApprovalStore(now: () => Date = () => new Date()): ApprovalStore & {
  rows: Map<string, ApprovalRow>;
} {
  const rows = new Map<string, ApprovalRow>();
  const live = (r: ApprovalRow) => r.usedAt === null && r.expiresAt > now();
  return {
    rows,
    async insert(row) {
      rows.set(row.id, {
        ...structuredClone(row),
        approvedAt: null,
        approvedBy: null,
        usedAt: null,
      });
    },
    async get(id) {
      const row = rows.get(id);
      return row ? structuredClone(row) : undefined;
    },
    async approve(id, approver, typedConfirmation) {
      const r = rows.get(id);
      if (!r || r.approvedAt !== null || !live(r)) return false;
      if (r.tier >= 3 && r.confirmationText !== typedConfirmation) return false;
      r.approvedAt = now();
      r.approvedBy = approver;
      return true;
    },
    async consume(id, hash) {
      const r = rows.get(id);
      if (!r || r.approvedAt === null || !live(r) || r.argsHash !== hash) return undefined;
      r.usedAt = now();
      return structuredClone(r);
    },
    async clearArgs(id) {
      const r = rows.get(id);
      if (r) r.args = null;
    },
    async listPending() {
      return [...rows.values()].filter(live).map((r) => structuredClone(r));
    },
  };
}
