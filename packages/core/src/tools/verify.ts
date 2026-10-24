// Verify step after a corrective action (CLAUDE.md non-negotiable 6): the app is ACTIVE, a container started after
// the action and has not died since, and the public address answers. Metrics are re-read for the report.
// A success is returned only when that holds; otherwise VerifyError, so the timeline records a failure.
import { z } from 'zod';

import { PROBE_PATH } from '../probe/index.js';
import type { ProbeResult } from '../probe/index.js';

import { VerifyError } from './types.js';
import type { ToolContext } from './types.js';

/** A path on https://<app>.liara.run, for check_health and verify steps. */
export const HealthPath = z
  .string()
  .regex(PROBE_PATH)
  .default('/health')
  .describe('Path on https://<app>.liara.run, e.g. /health (any answer below 500 counts as up)');

export const VERIFY_POLL_MS = 3_000;
export const VERIFY_ATTEMPTS = 20; // ~60 s, inside common MCP client request timeouts
/** Liara's event clock vs ours. */
const CLOCK_SKEW_S = 5;

export interface ContainerCheck {
  status: string;
  /** The container started at/after the action, and no die/stop of it since. */
  started: boolean;
  startedAt?: number;
}

export interface VerifyReport {
  verified: true;
  /** false when the container is up but the public name does not resolve yet (new app, DNS propagating). */
  httpChecked: boolean;
  attempts: number;
  app: ContainerCheck;
  http: ProbeResult;
  metrics?: unknown;
}

/** Unix seconds to pass as `since`, taken BEFORE the action is sent. */
export const verifySince = (ctx: ToolContext) =>
  Math.floor(ctx.now().getTime() / 1000) - CLOCK_SKEW_S;

async function containerCheck(
  app: string,
  since: number,
  ctx: ToolContext,
): Promise<ContainerCheck> {
  const [{ project }, { data }] = await Promise.all([
    ctx.liara.getApp(app),
    ctx.liara.getEvents(app),
  ]);
  const t = (e: { time?: string | null }) => Number(e.time ?? 0);
  // Events are newest first; take the newest start inside the window.
  const start = data.find((e) => e.status === 'start' && t(e) >= since);
  const diedSince =
    start !== undefined &&
    data.some(
      (e) => e.id === start.id && (e.status === 'die' || e.status === 'stop') && t(e) >= t(start),
    );
  return {
    status: project.status,
    started: start !== undefined && !diedSince && project.status === 'ACTIVE',
    ...(start ? { startedAt: t(start) } : {}),
  };
}

export async function verifyAppHealthy(
  app: string,
  since: number,
  ctx: ToolContext,
  opts: { healthPath?: string; what: { fa: string; en: string } },
): Promise<VerifyReport> {
  const path = opts.healthPath ?? '/health';
  let last: { app?: ContainerCheck; http?: ProbeResult; error?: string } = {};
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await ctx.sleep(VERIFY_POLL_MS);
    try {
      const container = await containerCheck(app, since, ctx);
      last = { app: container };
      if (!container.started) continue;
      const http = await ctx.probe(app, path);
      last.http = http;
      const dnsOnly = !http.reachable && http.failure === 'dns';
      if (http.healthy || dnsOnly) {
        const metrics = await ctx.liara.getMetricsSummary(app).catch(() => undefined);
        return {
          verified: true,
          httpChecked: !dnsOnly,
          attempts: attempt,
          app: container,
          http,
          ...(metrics !== undefined ? { metrics } : {}),
        };
      }
    } catch (err) {
      // A failing read is one failed attempt, not the end of the verify.
      last = { ...last, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const seconds = Math.round((VERIFY_ATTEMPTS * VERIFY_POLL_MS) / 1000);
  const why = !last.app?.started
    ? { fa: 'کانتینر تازه‌ای بالا نیامد', en: 'no new container came up' }
    : {
        fa: `آدرس عمومی پاسخ سالم نداد (${last.http?.messageFa ?? ''})`,
        en: `the public address did not answer healthily (${last.http?.messageEn ?? ''})`,
      };
  throw new VerifyError(
    `${opts.what.fa} ارسال شد، اما اپ «${app}» در ${seconds} ثانیه سالم برنگشت: ${why.fa}. رویدادها و لاگ‌ها را بررسی کنید.`,
    `${opts.what.en} was sent, but ${app} did not come back healthy within ${seconds} s: ${why.en}. Check get_events and get_logs.`,
    last,
  );
}
