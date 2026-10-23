import { describe, expect, it } from 'vitest';

import { fixtureBody } from '../../test/helpers/liara-mock.js';

import { offerablePlans, priceFor, recommendBundle, UnknownPlanError } from './plans.js';
import { MeResponse } from './schemas.js';

const me = MeResponse.parse(fixtureBody('v1-me'));

describe('plans (live v1/me catalog, 2026-10-22)', () => {
  it('offers only available Iran g2 plans, cheapest first', () => {
    const ids = offerablePlans(me).map((p) => p.planID);
    expect(ids).toEqual([
      'small-g2',
      'medium-g2',
      'standard-base-g2',
      'standard-plus-g2',
      'pro-g2',
      'pro-plus-g2',
      'pro-max-g2',
      'express-g2',
    ]);
  });

  it('prices match the console: Earth (small-g2) + basic = 750,000/month', () => {
    const p = priceFor(me, 'small-g2', 'basic');
    expect(Math.abs(p.monthly - 750_000)).toBeLessThanOrEqual(1000);
    expect(p.hourly).toBeCloseTo(659.72 + 381.94, 2);
    expect(p.monthlyWithVat).toBe(Math.round(p.monthly * 1.1));
    // Mars (medium-g2) + gold (pro) = 2,300,000 in docs/liara/plans.md
    expect(Math.abs(priceFor(me, 'medium-g2', 'pro').monthly - 2_300_000)).toBeLessThanOrEqual(
      1000,
    );
  });

  it('looks bundles up by ID, not by position', () => {
    // Position [1] is basic; the CLI would label it "Standard" (api-findings.md §3).
    const standard = priceFor(me, 'small-g2', 'standard');
    expect(standard.bundleHourly).toBe(me.plans.projectBundlePlans['small-g2']?.standard?.price);
    expect(standard.bundleHourly).not.toBe(me.plans.projectBundlePlans['small-g2']?.basic?.price);
  });

  it('refuses unknown plan or bundle IDs', () => {
    expect(() => priceFor(me, 'made-up-g2', 'basic')).toThrow(UnknownPlanError);
    expect(() => priceFor(me, 'small-g2', 'enterprise')).toThrow(UnknownPlanError);
  });

  it('recommends standard and explains basic from live fields (D18)', () => {
    const r = recommendBundle(me, 'small-g2');
    expect(r.bundlePlanID).toBe('standard');
    expect(r.reasonEn).toContain('no zero-downtime');
    expect(r.reasonEn).toContain('7 days');
    expect(r.reasonFa).toContain('7 روز');
  });
});
