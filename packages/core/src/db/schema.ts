// Drizzle schema (D8). Migrations: `pnpm --filter @miara/core db:generate`, applied with `pnpm db:migrate`.
import {
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey(),
    tool: text('tool').notNull(),
    app: text('app'),
    /** Nulled once used (it may hold env values). */
    args: jsonb('args'),
    argsHash: text('args_hash').notNull(),
    tier: smallint('tier').notNull(),
    escalation: jsonb('escalation'),
    costPreview: jsonb('cost_preview'),
    confirmationText: text('confirmation_text'),
    actor: text('actor').notNull(),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    approvedAt: ts('approved_at'),
    approvedBy: text('approved_by'),
    usedAt: ts('used_at'),
  },
  (t) => [index('approvals_pending_idx').on(t.expiresAt)],
);

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').primaryKey(),
    operationId: uuid('operation_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    tool: text('tool'),
    app: text('app'),
    tier: smallint('tier'),
    mode: text('mode'),
    actor: text('actor').notNull(),
    messageFa: text('message_fa').notNull(),
    messageEn: text('message_en').notNull(),
    errorRaw: jsonb('error_raw'),
    errorExplanationFa: text('error_explanation_fa'),
    llm: jsonb('llm'),
    llmCostUsd: doublePrecision('llm_cost_usd'),
    data: jsonb('data'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    index('timeline_app_created_idx').on(t.app, t.createdAt),
    index('timeline_operation_idx').on(t.operationId),
    index('timeline_breaker_idx').on(t.tool, t.app, t.mode, t.status, t.createdAt),
  ],
);

/** Phase 5 (worker + diagnosis) fills these. */
export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    app: text('app').notNull(),
    /** open | resolved | not_resolved */
    status: text('status').notNull().default('open'),
    rule: text('rule').notNull(),
    severity: text('severity').notNull(),
    titleFa: text('title_fa').notNull(),
    summary: text('summary'),
    evidence: jsonb('evidence'),
    openedAt: ts('opened_at').notNull().defaultNow(),
    resolvedAt: ts('resolved_at'),
    resolutionReason: text('resolution_reason'),
  },
  (t) => [index('incidents_app_status_idx').on(t.app, t.status)],
);

export const metricSnapshots = pgTable(
  'metric_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    app: text('app').notNull(),
    takenAt: ts('taken_at').notNull().defaultNow(),
    /** Cores. */
    cpu: doublePrecision('cpu'),
    memoryBytes: doublePrecision('memory_bytes'),
    probeStatus: integer('probe_status'),
    probeLatencyMs: integer('probe_latency_ms'),
    raw: jsonb('raw'),
  },
  (t) => [index('metric_snapshots_app_taken_idx').on(t.app, t.takenAt)],
);
