# Liara PaaS plans

**Live data first.** Plan IDs, resources, and prices come from `GET v1/me` → `plans.projects` (keys = planID) and
`plans.projectBundlePlans[planID]` (keys = bundlePlanID, `displayPrice`), as the CLI does in
`docs/vendor/liara-cli/src/commands/plan/list.ts:21-45`. Details are in `docs/liara/api-findings.md` §3.
The tables below are a **fallback only**, for when the API is unreachable, and the product must show their capture date.

Bundle (feature plan) ID mapping. **✅ Verified in Spike B (2026-10-22)** by price: for every plan,
`plan price×720 + bundle displayPrice` equals the console's monthly price for that bundle (e.g. `small-g2` 475,000 + `basic` 275,000 = Earth/Base 750,000).
| Console (fa) | CLI label | `bundlePlanID` |
|---|---|---|
| رایگان | Free | `free` (`available: false` on every g2 plan for this account) |
| پایه | Bronze | `basic` |
| نقره‌ای | Silver | `standard` |
| طلایی | Gold | `pro` |
Source: `docs/vendor/liara-cli/src/utils/set-bundle-plan-names.ts` and `v1-me.json`. `enterprise` (`errors/bundle-plan.ts:36`) is not in the live catalog.
`planID: free` requires `bundlePlanID: free`. Always key bundles by ID: the CLI's `plan list` labels them by position, which is wrong
for the live order `free, basic, standard, pro` (`api-findings.md` §3).

Plan ID mapping. **✅ Verified in Spike B** by the same arithmetic. The legacy IDs (`ir-*`, `standard-base`, `pro`, …) are also in the
catalog, often `available: true`; never offer them, only `*-g2` (the CLI filter).
| Console | `planID` |
|---|---|
| Earth (زمین) | `small-g2` |
| Mars (مریخ) | `medium-g2` |
| Jupiter (مشتری) | `standard-base-g2` |
| Saturn (زحل) | `standard-plus-g2` |
| Uranus (اورانوس) | `pro-g2` |
| Neptune (نپتون) | `pro-plus-g2` |
| Pluto (پلوتون) | `pro-max-g2` |
| — (64 GB / 32 vCPU, not in the console table) | `express-g2` |
`mini-g2` (0.25 GB) exists but is `available: false`.

What each bundle includes (live `plans.projectBundlePlans[*-g2]`, the same for every g2 plan except `backupSpace`, which grows with the plan):
| Limit | free | basic (پایه) | standard (نقره‌ای) | pro (طلایی) |
|---|---|---|---|---|
| Log retention (`maxLogsRetention`, days) | 0.05 (≈1 h) | 7 | 30 | 60 |
| Report/metrics retention (days) | 0.05 | 7 | 30 | 60 |
| Deploys per day | 10 | 20 | 50 | unlimited |
| Build timeout (min) | 5 | 5 | 15 | 60 |
| Max source size (MB) | 128 | 128 | 256 | 256 |
| Releases kept | 1 | 10 | 10 | 10 |
| Domains | 1 | 2 | 5 | unlimited |
| Disks per app | 1 | 2 | 5 | 10 |
| Rollback | no | yes | yes | yes |
| Zero-downtime deploy | no | **no** | yes | yes |
| Custom DNS / read-only FS | no | yes | yes | yes |
| Germany builder | no | yes | yes | yes |
| Backups | none | none | daily + manual | hourly/daily/weekly/monthly + manual |
| Free SSL | yes | yes | yes | yes |

Product impact: on `basic`, incident evidence older than 7 days is gone, and a redeploy has downtime (no zero-downtime), so warn
before restart/redeploy. A 128 MB source limit applies on free/basic.

## Fallback table (captured from the console 2026-10-22, may be outdated; matched the live API that day)

All plans are located in Iran, with unlimited (fair-use) traffic. Prices are in **toman, excluding 10% VAT**. Billing is hourly.
The displayed price = plan resources + feature bundle (e.g. Mars plan 825,000 + gold bundle 1,475,000 = 2,300,000/month;
+10% VAT = 2,530,000/month ≈ 3,514/hour).

| Plan | RAM | vCPU | Disk |
|---|---|---|---|
| Earth (زمین) | 512 MB | 0.5 | 5 GB |
| Mars (مریخ) | 1 GB | 1 | 10 GB |
| Jupiter (مشتری) | 2 GB | 1 | 20 GB |
| Saturn (زحل) | 4 GB | 2 | 40 GB |
| Uranus (اورانوس) | 8 GB | 4 | 80 GB |
| Neptune (نپتون) | 16 GB | 8 | 160 GB |
| Pluto (پلوتون) | 32 GB | 16 | 320 GB |

Monthly / hourly price by bundle:
| Plan | Base (پایه) | Silver (نقره‌ای) | Gold (طلایی) |
|---|---|---|---|
| Earth | 750,000 / 1,040 | 950,000 / 1,318 | 1,300,000 / 1,804 |
| Mars | 1,300,000 / 1,804 | 1,650,000 / 2,290 | 2,300,000 / 3,193 |
| Jupiter | 2,300,000 / 3,193 | 2,950,000 / 4,096 | 4,125,000 / 5,728 |
| Saturn | 4,125,000 / 5,728 | 5,300,000 / 7,360 | 7,250,000 / 10,068 |
| Uranus | 7,250,000 / 10,068 | 9,200,000 / 12,776 | 12,600,000 / 17,499 |
| Neptune | 12,600,000 / 17,499 | 16,000,000 / 22,222 | 22,000,000 / 30,555 |
| Pluto | 22,000,000 / 30,555 | 28,000,000 / 38,888 | 38,600,000 / 53,610 |

TODO (developer will supply): the DBaaS plans (the live catalog is in `v1/me` → `plans.databases` / `databaseBundlePlans`,
not yet read). PaaS plan IDs come only from `GET v1/me`, so never hard-code them; the mappings above are for display.

Recommendation heuristic (state the reason to the user). Default bundle is **standard** (D18): basic has no zero-downtime
and only 7-day logs, and Miara says so when the user picks basic.
- Static/small Node or demo → Earth or Mars, standard bundle (offer basic as the cheaper option, with the D18 caveats).
- Next.js SSR / typical API with DB → Mars or Jupiter.
- Observed RAM > 80% sustained → suggest one plan up, show the cost delta, tier 3.
- Always offer the cheaper option, and explain hourly billing from credit (show the billing balance: `team.balance` in team mode, else `user.balance`).
