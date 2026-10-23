import type { TimelineEvent, TimelineSink } from './types.js';

/** In-memory sink for tests and offline use. The Postgres sink is db/timeline-sink.ts. */
export function createMemoryTimelineSink(): TimelineSink & { events: TimelineEvent[] } {
  const events: TimelineEvent[] = [];
  return {
    events,
    async write(event) {
      events.push(structuredClone(event));
    },
    async countAutoStarts({ tool, app, since }) {
      return events.filter(
        (e) =>
          e.type === 'operation' &&
          e.status === 'start' &&
          e.mode === 'auto' &&
          e.tool === tool &&
          e.app === app &&
          e.createdAt >= since,
      ).length;
    },
    async list(query = {}) {
      return events
        .filter((e) => (query.app ? e.app === query.app : true))
        .filter((e) => (query.operationId ? e.operationId === query.operationId : true))
        .slice(-(query.limit ?? 100));
    },
  };
}
