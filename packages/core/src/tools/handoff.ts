// Coding-agent handoff tools (Phase 6 uses them end to end): read open incidents, report a code fix.
import { z } from 'zod';

import { defineTool } from './types.js';
import type { AnyToolDef } from './types.js';

export const handoffTools: AnyToolDef[] = [
  defineTool({
    name: 'get_open_incidents',
    description: {
      fa: 'حادثه‌های باز (برای عامل کدنویسی)',
      en: 'Open incidents (for the coding agent)',
    },
    tier: 0,
    input: z.object({}),
    handler: (_args, { incidents }) => incidents.listOpen(),
  }),
  defineTool({
    name: 'report_fix',
    description: {
      fa: 'عامل کدنویسی رفع مشکل را گزارش داد',
      en: 'The coding agent reports a code fix for an incident',
    },
    // Touches no Liara state: the timeline events of this run are the report. The incident stays open;
    // Phase 6 verifies (metrics, status, probe) before closing it.
    tier: 1,
    input: z.object({
      incidentId: z.uuid(),
      summary: z.string().min(1).max(2000),
      commit: z.string().max(64).optional(),
    }),
    handler: async ({ incidentId, summary, commit }) => ({
      incidentId,
      summary,
      ...(commit ? { commit } : {}),
      recorded: true,
    }),
  }),
];
