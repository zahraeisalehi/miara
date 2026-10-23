// Tier-1 circuit breaker (D19): too many automatic restarts/deploys in an hour → a human decides the next one.
import type { TimelineSink } from '../timeline/types.js';
import type { BreakerKind } from '../tools/types.js';

import type { Escalation } from './store.js';

export const BREAKER_WINDOW_MS = 60 * 60 * 1000;
export const AUTO_RESTARTS_PER_HOUR = 2;
export const AUTO_DEPLOYS_PER_HOUR = 3;

const LIMITS: Record<BreakerKind, number> = {
  restart: AUTO_RESTARTS_PER_HOUR,
  deploy: AUTO_DEPLOYS_PER_HOUR,
};

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n: number) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);

/** Counts auto-executed starts of `tool` on `app` in the last hour; returns an escalation once the limit is reached. */
export async function checkBreaker(
  sink: TimelineSink,
  kind: BreakerKind,
  tool: string,
  app: string,
  now: Date,
): Promise<Escalation | null> {
  const count = await sink.countAutoStarts({
    tool,
    app,
    since: new Date(now.getTime() - BREAKER_WINDOW_MS),
  });
  const limit = LIMITS[kind];
  if (count < limit) return null;
  const whatFa = kind === 'restart' ? 'ری‌استارت' : 'استقرار';
  const whatEn = kind === 'restart' ? 'restarts' : 'deploys';
  return {
    reasonFa: `در یک ساعت گذشته ${faNum(count)} ${whatFa} خودکار برای «${app}» انجام شده است (سقف ${faNum(limit)}). این بار تأیید شما لازم است؛ شاید مشکل با ${whatFa} حل نمی‌شود.`,
    reasonEn: `${count} automatic ${whatEn} of "${app}" in the last hour (limit ${limit}). This one needs your approval; repeating it may not fix the problem.`,
  };
}
