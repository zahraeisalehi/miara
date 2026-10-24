// Write tools (D19 tiers). Endpoints come only from the spec pages or the CLI (cited in liara/client.ts).
// Phase 1b: tested against mocks only; no live write has run.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

import { z } from 'zod';

import { BUNDLE_IDS, lookup, offerablePlans, priceFor } from '../liara/plans.js';

import { defineTool, ToolInputError } from './types.js';
import type { AnyToolDef, CostPreview, ToolContext } from './types.js';
import { HealthPath, verifyAppHealthy, verifySince } from './verify.js';

const AppName = z.string().min(1).describe('Liara app name (project_id)');
const EnvKey = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'env key: letters, digits, underscore');

/** The CLI refuses sources over 256 MiB (constants.ts:29). */
export const MAX_SOURCE_BYTES = 256 * 1024 * 1024;

async function appState(app: string, { liara }: ToolContext) {
  const { project } = await liara.getApp(app);
  return {
    app,
    status: project.status,
    scale: project.scale,
    planID: project.planID,
    bundlePlanID: project.bundlePlanID,
    isDeployed: project.isDeployed,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readArchive(path: string): Promise<Uint8Array> {
  if (!/\.(tar\.gz|tgz)$/.test(path)) {
    throw new ToolInputError(
      'فایل سورس باید .tar.gz باشد.',
      'The source archive must be a .tar.gz file.',
    );
  }
  const info = await stat(path);
  if (info.size > MAX_SOURCE_BYTES) {
    throw new ToolInputError(
      'حجم سورس بیشتر از ۲۵۶ مگابایت است.',
      'The source archive is over 256 MiB.',
    );
  }
  const bytes = new Uint8Array(await readFile(path));
  // gzip magic number: refuses to upload an arbitrary local file under a .tar.gz name.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new ToolInputError(
      'فایل سورس gzip معتبر نیست.',
      'The source archive is not a valid gzip file.',
    );
  }
  return bytes;
}

const DeployInput = z.object({
  app: AppName,
  archivePath: z.string().min(1).describe('Local path of the .tar.gz built by the deploy workflow'),
  port: z.number().int().min(1).max(65535),
  platform: z.string().min(1).describe('Liara platform, e.g. node'),
  platformConfig: z.record(z.string(), z.unknown()).optional(),
  message: z.string().max(500).optional(),
  buildLocation: z.enum(['iran', 'germany']).default('iran'),
  /** Set by prepare(); part of the approval hash, re-checked before upload. */
  archiveSha256: z.string().optional(),
  archiveBytes: z.number().optional(),
});

async function planCost(
  ctx: ToolContext,
  next: { planID: string; bundlePlanID: string },
  current?: { planID: string; bundlePlanID: string },
): Promise<CostPreview> {
  const me = await ctx.liara.getMe();
  const n = priceFor(me, next.planID, next.bundlePlanID);
  const c = current ? priceFor(me, current.planID, current.bundlePlanID) : undefined;
  const delta = c ? n.monthlyWithVat - c.monthlyWithVat : undefined;
  const fmt = (v: number) => v.toLocaleString('en-US');
  return {
    currency: 'toman',
    vatRate: n.vatRate,
    ...(c
      ? {
          current: {
            planID: c.planID,
            bundlePlanID: c.bundlePlanID,
            monthly: c.monthly,
            monthlyWithVat: c.monthlyWithVat,
          },
        }
      : {}),
    next: {
      planID: n.planID,
      bundlePlanID: n.bundlePlanID,
      monthly: n.monthly,
      monthlyWithVat: n.monthlyWithVat,
    },
    ...(delta !== undefined ? { deltaMonthlyWithVat: delta } : {}),
    noteFa:
      delta !== undefined
        ? `هزینه‌ی ماهانه با مالیات از ${fmt(c?.monthlyWithVat ?? 0)} به ${fmt(n.monthlyWithVat)} تومان می‌رسد (ساعتی از اعتبار کسر می‌شود).`
        : `هزینه‌ی ماهانه با مالیات حدود ${fmt(n.monthlyWithVat)} تومان (ساعتی از اعتبار کسر می‌شود).`,
    noteEn:
      delta !== undefined
        ? `Monthly cost incl. VAT goes from ${fmt(c?.monthlyWithVat ?? 0)} to ${fmt(n.monthlyWithVat)} toman (billed hourly from credit).`
        : `About ${fmt(n.monthlyWithVat)} toman/month incl. VAT (billed hourly from credit).`,
  };
}

export const writeTools: AnyToolDef[] = [
  defineTool({
    name: 'restart_app',
    description: { fa: 'ری‌استارت اپ', en: 'Restart the app' },
    tier: 1,
    breaker: 'restart',
    input: z.object({ app: AppName, healthPath: HealthPath }),
    appOf: (a) => a.app,
    reconcile: ({ app }, ctx) => appState(app, ctx),
    // Success only after the verify step: a new container is up and the public address answers.
    async handler({ app, healthPath }, ctx) {
      const since = verifySince(ctx);
      const ack = await ctx.liara.restartApp(app);
      const verify = await verifyAppHealthy(app, since, ctx, {
        healthPath,
        what: { fa: 'ری‌استارت', en: 'The restart' },
      });
      return { app, ack, verify };
    },
  }),
  defineTool({
    name: 'set_app_power',
    description: { fa: 'روشن یا خاموش کردن اپ', en: 'Turn the app on or off' },
    tier: 1,
    input: z.object({ app: AppName, on: z.boolean() }),
    appOf: (a) => a.app,
    // D19: power off takes the app down, so it needs a human.
    tierFor: ({ on }) => (on ? 1 : 2),
    reconcile: ({ app }, ctx) => appState(app, ctx),
    handler: ({ app, on }, { liara }) => liara.scaleApp(app, on ? 1 : 0),
  }),
  defineTool({
    name: 'set_env',
    description: {
      fa: 'تنظیم یا حذف متغیرهای محیطی (اپ ری‌استارت می‌شود)',
      en: 'Set or unset env vars (restarts the app)',
    },
    tier: 1,
    input: z
      .object({
        app: AppName,
        set: z.record(EnvKey, z.string()).default({}),
        unset: z.array(EnvKey).default([]),
      })
      .refine((a) => Object.keys(a.set).length + a.unset.length > 0, 'nothing to change'),
    sensitive: ['set'],
    appOf: (a) => a.app,
    // D19: an app with a custom domain is serving real users, so env changes need a human.
    tierFor: async ({ app }, { liara }) =>
      (await liara.listDomains(app)).domains.length > 0 ? 2 : 1,
    reconcile: ({ app }, ctx) => appState(app, ctx),
    async handler({ app, set, unset }, { liara }) {
      // update-envs replaces the whole set: merge with the current envs like the CLI (commands/env/set.ts:46-52).
      const { project } = await liara.getApp(app);
      const merged = new Map(project.envs.map((e) => [e.key, e.value]));
      for (const key of unset) merged.delete(key);
      for (const [key, value] of Object.entries(set)) merged.set(key, value);
      await liara.updateEnvs(
        app,
        [...merged].map(([key, value]) => ({ key, value })),
      );
      return { app, set: Object.keys(set), unset, restarting: true };
    },
  }),
  defineTool({
    name: 'deploy_release',
    description: {
      fa: 'استقرار سورس آماده‌شده روی لیارا',
      en: 'Deploy a packed source archive to Liara',
    },
    tier: 1,
    breaker: 'deploy',
    input: DeployInput,
    appOf: (a) => a.app,
    async prepare(args) {
      const bytes = await readArchive(args.archivePath);
      return { ...args, archiveSha256: sha256(bytes), archiveBytes: bytes.length };
    },
    reconcile: async ({ app }, { liara }) => {
      const { releases, currentRelease } = await liara.listReleases(app, 1, 3);
      return {
        app,
        currentRelease,
        latest: releases.map((r) => ({ _id: r._id, state: r.state, createdAt: r.createdAt })),
      };
    },
    async handler(args, { liara }) {
      const bytes = await readArchive(args.archivePath);
      if (!args.archiveSha256 || sha256(bytes) !== args.archiveSha256) {
        throw new ToolInputError(
          'فایل سورس بعد از بررسی تغییر کرده است؛ دوباره درخواست استقرار بدهید.',
          'The source archive changed after it was checked; propose the deploy again.',
        );
      }
      const { sourceID } = await liara.uploadSource(args.app, bytes);
      // Body as the CLI builds it (commands/deploy.ts:403-436); fields Miara doesn't set are omitted.
      const { releaseID } = await liara.createRelease(args.app, {
        build: { location: args.buildLocation },
        port: args.port,
        type: args.platform,
        ...(args.message ? { message: args.message } : {}),
        ...(args.platformConfig ? { platformConfig: args.platformConfig } : {}),
        sourceID,
      });
      return { app: args.app, sourceID, releaseID };
    },
  }),
  defineTool({
    name: 'change_plan',
    description: {
      fa: 'تغییر پلن منابع اپ (هزینه تغییر می‌کند)',
      en: "Change the app's resource plan (changes cost)",
    },
    tier: 3,
    input: z.object({ app: AppName, planID: z.string().min(1) }),
    appOf: (a) => a.app,
    async prepare(args, { liara }) {
      const me = await liara.getMe();
      if (!offerablePlans(me).some((p) => p.planID === args.planID)) {
        throw new ToolInputError(
          `پلن «${args.planID}» در فهرست پلن‌های قابل انتخاب لیارا نیست.`,
          `Plan "${args.planID}" is not an offerable Liara plan.`,
        );
      }
      return args;
    },
    async costPreview({ app, planID }, ctx) {
      const { project } = await ctx.liara.getApp(app);
      return planCost(
        ctx,
        { planID, bundlePlanID: project.bundlePlanID },
        { planID: project.planID, bundlePlanID: project.bundlePlanID },
      );
    },
    confirmationText: ({ app }) => app,
    reconcile: ({ app }, ctx) => appState(app, ctx),
    handler: ({ app, planID }, { liara }) => liara.resizeApp(app, planID),
  }),
  defineTool({
    name: 'create_app',
    description: {
      fa: 'ساخت اپ جدید روی لیارا (هزینه دارد)',
      en: 'Create a new Liara app (costs money)',
    },
    tier: 3,
    input: z
      .object({
        name: z.string().min(1),
        platform: z.string().min(1),
        planID: z.string().min(1),
        bundlePlanID: z.enum(BUNDLE_IDS),
        networkId: z.string().min(1).describe('_id from list_networks'),
        readOnlyRootFilesystem: z.boolean().optional(),
      })
      // CLI commands/app/create.ts:76
      .refine((a) => a.planID !== 'free' || a.bundlePlanID === 'free', {
        message: 'planID "free" requires bundlePlanID "free"',
      }),
    appOf: (a) => a.name,
    async prepare(args, { liara }) {
      const me = await liara.getMe();
      if (!offerablePlans(me).some((p) => p.planID === args.planID)) {
        throw new ToolInputError(
          `پلن «${args.planID}» در فهرست پلن‌های قابل انتخاب لیارا نیست.`,
          `Plan "${args.planID}" is not an offerable Liara plan.`,
        );
      }
      lookup(me, args.planID, args.bundlePlanID); // throws UnknownPlanError
      const { networks } = await liara.listNetworks();
      if (!networks.some((n) => n._id === args.networkId)) {
        throw new ToolInputError('این شبکه پیدا نشد.', `Network ${args.networkId} was not found.`);
      }
      return args;
    },
    costPreview: (args, ctx) =>
      planCost(ctx, { planID: args.planID, bundlePlanID: args.bundlePlanID }),
    confirmationText: ({ name }) => name,
    reconcile: async ({ name }, { liara }) => ({
      name,
      exists: (await liara.listApps()).projects.some((p) => p.project_id === name),
    }),
    handler: (args, { liara }) => liara.createApp(args),
  }),
];
