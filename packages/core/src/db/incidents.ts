import { desc, eq } from 'drizzle-orm';

import type { IncidentReader } from '../tools/types.js';

import type { Db } from './client.js';
import { incidents } from './schema.js';

/** Read side of the `incidents` table for the handoff tools; the worker (Phase 5) writes it. */
export function createPgIncidentReader(db: Db): IncidentReader {
  return {
    async listOpen() {
      const rows = await db
        .select()
        .from(incidents)
        .where(eq(incidents.status, 'open'))
        .orderBy(desc(incidents.openedAt))
        .limit(50);
      return rows.map((r) => ({
        id: r.id,
        app: r.app,
        status: r.status,
        rule: r.rule,
        severity: r.severity,
        titleFa: r.titleFa,
        summary: r.summary,
        openedAt: r.openedAt,
      }));
    },
  };
}
