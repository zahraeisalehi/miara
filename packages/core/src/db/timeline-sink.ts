import { and, count, desc, eq, gte } from 'drizzle-orm';

import type { TimelineEvent, TimelineSink } from '../timeline/types.js';

import type { Db } from './client.js';
import { timelineEvents } from './schema.js';

type Row = typeof timelineEvents.$inferSelect;

function toEvent(r: Row): TimelineEvent {
  return {
    id: r.id,
    operationId: r.operationId,
    type: r.type as TimelineEvent['type'],
    status: r.status as TimelineEvent['status'],
    tool: r.tool ?? undefined,
    app: r.app ?? undefined,
    tier: r.tier ?? undefined,
    mode: (r.mode ?? undefined) as TimelineEvent['mode'],
    actor: r.actor as TimelineEvent['actor'],
    messageFa: r.messageFa,
    messageEn: r.messageEn,
    errorRaw: r.errorRaw ?? undefined,
    errorExplanationFa: r.errorExplanationFa ?? undefined,
    llm: (r.llm ?? undefined) as TimelineEvent['llm'],
    data: r.data ?? undefined,
    createdAt: r.createdAt,
  };
}

export function createPgTimelineSink(db: Db): TimelineSink {
  return {
    async write(e) {
      await db.insert(timelineEvents).values({
        id: e.id,
        operationId: e.operationId,
        type: e.type,
        status: e.status,
        tool: e.tool ?? null,
        app: e.app ?? null,
        tier: e.tier ?? null,
        mode: e.mode ?? null,
        actor: e.actor,
        messageFa: e.messageFa,
        messageEn: e.messageEn,
        errorRaw: e.errorRaw ?? null,
        errorExplanationFa: e.errorExplanationFa ?? null,
        llm: e.llm ?? null,
        llmCostUsd: e.llm?.costUsd ?? null,
        data: e.data ?? null,
        createdAt: e.createdAt,
      });
    },

    async countAutoStarts({ tool, app, since }) {
      const [r] = await db
        .select({ n: count() })
        .from(timelineEvents)
        .where(
          and(
            eq(timelineEvents.type, 'operation'),
            eq(timelineEvents.status, 'start'),
            eq(timelineEvents.mode, 'auto'),
            eq(timelineEvents.tool, tool),
            eq(timelineEvents.app, app),
            gte(timelineEvents.createdAt, since),
          ),
        );
      return r?.n ?? 0;
    },

    async list(query = {}) {
      const where = and(
        query.app ? eq(timelineEvents.app, query.app) : undefined,
        query.operationId ? eq(timelineEvents.operationId, query.operationId) : undefined,
      );
      const rows = await db
        .select()
        .from(timelineEvents)
        .where(where)
        .orderBy(desc(timelineEvents.createdAt))
        .limit(query.limit ?? 100);
      return rows.reverse().map(toEvent);
    },
  };
}
