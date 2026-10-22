# Liara PaaS plans

**Live data first.** Plan IDs, resources, and prices come from `GET v1/me` → `plans.projects` (keys = planID) and
`plans.projectBundlePlans[planID]` (keys = bundlePlanID, `displayPrice`), as the CLI does in
`docs/vendor/liara-cli/src/commands/plan/list.ts:21-45`. Details are in `docs/liara/api-findings.md` §3.
The tables below are a **fallback only**, for when the API is unreachable, and the product must show their capture date.

Bundle (feature plan) ID mapping. **Verify in Spike B.**
| Console (fa) | CLI label | `bundlePlanID` |
|---|---|---|
| رایگان | Free | `free` |
| پایه | Bronze | `basic` |
| نقره‌ای | Silver | `standard` |
| طلایی | Gold | `pro` |
Source: `docs/vendor/liara-cli/src/utils/set-bundle-plan-names.ts`. `enterprise` also exists (`errors/bundle-plan.ts:36`).
`planID: free` requires `bundlePlanID: free`.

## Fallback table (captured from the console 2026-10-22, may be outdated)

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

TODO (developer will supply): what each bundle includes (e.g. zero-downtime, backups; known so far: log retention and
source-size/deploy limits per `api-findings.md`), and the DBaaS plans. Bundle IDs are in the mapping above. PaaS plan IDs
(e.g. `free`, `*g2*` keys) come only from `GET v1/me`, so never hard-code them.

Recommendation heuristic (state the reason to the user):
- Static/small Node or demo → Earth or Mars, base bundle.
- Next.js SSR / typical API with DB → Mars or Jupiter.
- Observed RAM > 80% sustained → suggest one plan up, show the cost delta, tier 3.
- Always offer the cheaper option, and explain hourly billing from credit (show the billing balance).
