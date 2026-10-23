// Postgres ApprovalStore. approve() and consume() are each ONE conditional UPDATE … RETURNING, so two concurrent
// callers can never both win (policy/gate.ts). Expiry uses the database clock: expires_at > now().
import { and, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import type { ApprovalRow, ApprovalStore, Approver } from '../policy/store.js';
import type { Tier } from '../tools/types.js';
import type { Actor } from '../timeline/types.js';

import type { Db } from './client.js';
import { approvals } from './schema.js';

type Row = typeof approvals.$inferSelect;

function toRow(r: Row): ApprovalRow {
  return {
    id: r.id,
    tool: r.tool,
    app: r.app,
    args: r.args,
    argsHash: r.argsHash,
    tier: r.tier as Tier,
    escalation: r.escalation as ApprovalRow['escalation'],
    costPreview: r.costPreview as ApprovalRow['costPreview'],
    confirmationText: r.confirmationText,
    actor: r.actor as Actor,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    approvedAt: r.approvedAt,
    approvedBy: r.approvedBy as Approver | null,
    usedAt: r.usedAt,
  };
}

const now = sql`now()`;

export function createPgApprovalStore(db: Db): ApprovalStore {
  return {
    async insert(row) {
      await db.insert(approvals).values({ ...row, args: row.args ?? null });
    },

    async get(id) {
      const [r] = await db.select().from(approvals).where(eq(approvals.id, id));
      return r ? toRow(r) : undefined;
    },

    async approve(id, approver, typedConfirmation) {
      const updated = await db
        .update(approvals)
        .set({ approvedAt: now, approvedBy: approver })
        .where(
          and(
            eq(approvals.id, id),
            isNull(approvals.approvedAt),
            isNull(approvals.usedAt),
            gt(approvals.expiresAt, now),
            or(
              lt(approvals.tier, 3),
              typedConfirmation === null
                ? sql`false`
                : eq(approvals.confirmationText, typedConfirmation),
            ),
          ),
        )
        .returning({ id: approvals.id });
      return updated.length === 1;
    },

    async consume(id, argsHash) {
      const [r] = await db
        .update(approvals)
        .set({ usedAt: now })
        .where(
          and(
            eq(approvals.id, id),
            isNotNull(approvals.approvedAt),
            isNull(approvals.usedAt),
            gt(approvals.expiresAt, now),
            eq(approvals.argsHash, argsHash),
          ),
        )
        .returning();
      return r ? toRow(r) : undefined;
    },

    async clearArgs(id) {
      await db.update(approvals).set({ args: null }).where(eq(approvals.id, id));
    },

    async listPending() {
      const rows = await db
        .select()
        .from(approvals)
        .where(and(isNull(approvals.usedAt), gt(approvals.expiresAt, now)));
      return rows.map(toRow);
    },
  };
}

/** Clears stored args of expired, unused approvals (env values must not outlive the approval). */
export async function purgeExpiredApprovalArgs(db: Db): Promise<number> {
  const rows = await db
    .update(approvals)
    .set({ args: null })
    .where(and(isNull(approvals.usedAt), lt(approvals.expiresAt, now), isNotNull(approvals.args)))
    .returning({ id: approvals.id });
  return rows.length;
}
