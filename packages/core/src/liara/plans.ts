// Plan catalog helpers over the live GET v1/me (D14). Bundles are looked up by ID, never by position
// (the CLI's positional labels are wrong for the live order: docs/liara/api-findings.md §3).
import type { z } from 'zod';

import type { BundlePlan, MeResponse, ProjectPlan } from './schemas.js';

type Me = z.infer<typeof MeResponse>;

/** Liara bills hourly; a month is 720 hours (CLI commands/plan/list.ts:45). */
export const HOURS_PER_MONTH = 720;
/** Prices exclude 10% VAT (docs/liara/plans.md). */
export const VAT_RATE = 0.1;

export const BUNDLE_IDS = ['free', 'basic', 'standard', 'pro'] as const;
export type BundleId = (typeof BUNDLE_IDS)[number];

export class UnknownPlanError extends Error {
  constructor(kind: 'plan' | 'bundle', id: string, planID?: string) {
    super(
      kind === 'plan'
        ? `Unknown planID "${id}" (not in GET v1/me)`
        : `Unknown bundlePlanID "${id}" for plan "${planID ?? ''}" (not in GET v1/me)`,
    );
    this.name = 'UnknownPlanError';
  }
}

export interface OfferablePlan {
  planID: string;
  ramGb: number;
  cpu: number;
  diskGb: number;
  hourly: number;
  bundles: { bundlePlanID: string; hourly: number; monthly: number; available: boolean }[];
}

/** The CLI's filter: `free` or `*g2*`, available, in Iran (commands/plan/list.ts:22-30). */
export function offerablePlans(me: Me): OfferablePlan[] {
  return Object.entries(me.plans.projects)
    .filter(([id, p]) => (id === 'free' || id.includes('g2')) && p.available && p.region === 'iran')
    .map(([planID, p]) => ({
      planID,
      ramGb: p.RAM.amount,
      cpu: p.CPU.amount,
      diskGb: p.volume,
      hourly: p.price,
      bundles: Object.entries(me.plans.projectBundlePlans[planID] ?? {}).map(([id, b]) => ({
        bundlePlanID: id,
        hourly: b.price,
        monthly: b.displayPrice,
        available: b.available,
      })),
    }))
    .sort((a, b) => a.hourly - b.hourly);
}

export function lookup(
  me: Me,
  planID: string,
  bundlePlanID: string,
): { plan: z.infer<typeof ProjectPlan>; bundle: z.infer<typeof BundlePlan> } {
  const plan = me.plans.projects[planID];
  if (!plan) throw new UnknownPlanError('plan', planID);
  const bundle = me.plans.projectBundlePlans[planID]?.[bundlePlanID];
  if (!bundle) throw new UnknownPlanError('bundle', bundlePlanID, planID);
  return { plan, bundle };
}

export interface Price {
  planID: string;
  bundlePlanID: string;
  planHourly: number;
  bundleHourly: number;
  hourly: number;
  monthly: number;
  vatRate: number;
  hourlyWithVat: number;
  monthlyWithVat: number;
}

/** Toman. Monthly = (plan + bundle) × 720, rounded; matches the console to within rounding (Spike B). */
export function priceFor(me: Me, planID: string, bundlePlanID: string): Price {
  const { plan, bundle } = lookup(me, planID, bundlePlanID);
  const hourly = plan.price + bundle.price;
  const monthly = Math.round(hourly * HOURS_PER_MONTH);
  return {
    planID,
    bundlePlanID,
    planHourly: plan.price,
    bundleHourly: bundle.price,
    hourly,
    monthly,
    vatRate: VAT_RATE,
    hourlyWithVat: Math.round(hourly * (1 + VAT_RATE)),
    monthlyWithVat: Math.round(monthly * (1 + VAT_RATE)),
  };
}

export interface BundleRecommendation {
  bundlePlanID: 'standard';
  reasonFa: string;
  reasonEn: string;
}

/** D18: default to standard and say why basic is weaker, using the live bundle fields. */
export function recommendBundle(me: Me, planID: string): BundleRecommendation {
  const basic = lookup(me, planID, 'basic').bundle;
  const standard = lookup(me, planID, 'standard').bundle;
  const basicLogs = basic.maxLogsRetention ?? 0;
  const standardLogs = standard.maxLogsRetention ?? 0;
  const zd = basic.zeroDowntime
    ? ''
    : ' no zero-downtime deploys (a short outage on every deploy/restart);';
  const zdFa = basic.zeroDowntime
    ? ''
    : ' استقرار بدون قطعی ندارد (هر استقرار یا ری‌استارت کمی قطعی دارد)؛';
  return {
    bundlePlanID: 'standard',
    reasonFa: `پلن ویژگی «نقره‌ای» (standard) پیشنهاد می‌شود. «پایه» (basic):${zdFa} لاگ‌ها فقط ${basicLogs} روز نگه داشته می‌شوند (در نقره‌ای ${standardLogs} روز).`,
    reasonEn: `Recommended bundle: standard. basic has${zd} logs kept for only ${basicLogs} days (standard: ${standardLogs}).`,
  };
}
