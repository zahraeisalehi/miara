// Tier-0 read tools. Results are redacted by the gate before they leave core (envs values, IPs, secrets).
import { z } from 'zod';

import { getLogs } from '../liara/logs.js';
import { offerablePlans, recommendBundle, VAT_RATE } from '../liara/plans.js';

import { defineTool } from './types.js';
import type { AnyToolDef } from './types.js';

const App = z.object({ app: z.string().min(1).describe('Liara app name (project_id)') });
const MAX_LOG_LINES = 300;

export const readTools: AnyToolDef[] = [
  defineTool({
    name: 'list_apps',
    description: { fa: 'فهرست اپ‌های لیارا', en: 'List Liara apps' },
    tier: 0,
    input: z.object({}),
    handler: async (_args, { liara }) => (await liara.listApps()).projects,
  }),
  defineTool({
    name: 'get_app',
    description: {
      fa: 'جزئیات یک اپ (پلن، وضعیت، زیردامنه‌ی پیش‌فرض)',
      en: 'App details (plan, status, default subdomain)',
    },
    tier: 0,
    input: App,
    appOf: (a) => a.app,
    handler: async ({ app }, { liara }) => (await liara.getApp(app)).project,
  }),
  defineTool({
    name: 'get_logs',
    description: { fa: 'لاگ‌های اجرای اپ', en: 'App runtime logs' },
    tier: 0,
    input: App.extend({
      sinceMinutes: z
        .number()
        .int()
        .min(1)
        .max(60 * 24 * 60)
        .default(60),
    }),
    appOf: (a) => a.app,
    async handler({ app, sinceMinutes }, { liara, now }) {
      const since = Math.floor(now().getTime() / 1000) - sinceMinutes * 60;
      const { source, lines } = await getLogs(liara, app, since);
      return {
        source,
        total: lines.length,
        truncated: lines.length > MAX_LOG_LINES,
        lines: lines.slice(-MAX_LOG_LINES),
      };
    },
  }),
  defineTool({
    name: 'get_events',
    description: {
      fa: 'رویدادهای کانتینر اپ (شروع، توقف، کرش)',
      en: 'App container events (start, stop, die)',
    },
    tier: 0,
    input: App,
    appOf: (a) => a.app,
    handler: async ({ app }, { liara }) => (await liara.getEvents(app)).data,
  }),
  defineTool({
    name: 'list_releases',
    description: { fa: 'تاریخچه‌ی استقرارها', en: 'Release history' },
    tier: 0,
    input: App.extend({
      page: z.number().int().min(1).default(1),
      count: z.number().int().min(1).max(50).default(10),
    }),
    appOf: (a) => a.app,
    handler: ({ app, page, count }, { liara }) => liara.listReleases(app, page, count),
  }),
  defineTool({
    name: 'get_release',
    description: { fa: 'وضعیت یک استقرار', en: 'Release status' },
    tier: 0,
    input: z.object({ releaseId: z.string().min(1) }),
    handler: async ({ releaseId }, { liara }) => (await liara.getRelease(releaseId)).release,
  }),
  defineTool({
    name: 'get_build_logs',
    description: { fa: 'لاگ ساخت یک استقرار', en: 'Build logs of a release' },
    tier: 0,
    input: z.object({ releaseId: z.string().min(1), since: z.string().optional() }),
    handler: ({ releaseId, since }, { liara }) => liara.getBuildLogs(releaseId, since),
  }),
  defineTool({
    name: 'get_metrics_summary',
    description: { fa: 'خلاصه‌ی مصرف CPU و حافظه', en: 'CPU and memory summary' },
    tier: 0,
    input: App,
    appOf: (a) => a.app,
    handler: ({ app }, { liara }) => liara.getMetricsSummary(app),
  }),
  defineTool({
    name: 'get_metrics',
    description: { fa: 'نمودار CPU یا حافظه', en: 'CPU or memory series' },
    tier: 0,
    input: App.extend({
      kind: z.enum(['cpu', 'memory']),
      sinceMinutes: z
        .number()
        .int()
        .min(1)
        .max(60 * 24 * 60)
        .default(60),
    }),
    appOf: (a) => a.app,
    handler: ({ app, kind, sinceMinutes }, { liara, now }) =>
      liara.getMetrics(app, kind, Math.floor(now().getTime() / 1000) - sinceMinutes * 60),
  }),
  defineTool({
    name: 'get_billing',
    description: {
      fa: 'موجودی حساب (در حالت تیمی، موجودی تیم)',
      en: 'Account balance (team balance in team mode)',
    },
    tier: 0,
    input: z.object({}),
    handler: (_args, { liara }) => liara.getBalance(),
  }),
  defineTool({
    name: 'list_networks',
    description: { fa: 'شبکه‌های خصوصی', en: 'Private networks' },
    tier: 0,
    input: z.object({}),
    handler: async (_args, { liara }) => (await liara.listNetworks()).networks,
  }),
  defineTool({
    name: 'list_plans',
    description: {
      fa: 'پلن‌ها و قیمت‌ها (زنده از لیارا)',
      en: 'Plans and prices (live from Liara)',
    },
    tier: 0,
    input: z.object({}),
    async handler(_args, { liara }) {
      const me = await liara.getMe();
      const plans = offerablePlans(me);
      const first = plans.find((p) => p.planID !== 'free');
      return {
        currency: 'toman',
        vatRate: VAT_RATE,
        plans,
        ...(first ? { recommendation: recommendBundle(me, first.planID) } : {}),
      };
    },
  }),
];
