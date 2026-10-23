# @miara/core — all logic and every side effect

Modules (docs/ARCHITECTURE.md): `liara/` client · `tools/` registry + risk tiers · `policy/` gate + approval tokens ·
`workflows/` · `diagnosis/` evidence packs · `llm/` provider adapter, router, narrator, diagnoser · `timeline/` · `db/` (Drizzle).

Rules
- Team mode: every Liara call appends the `teamID` query param (from optional `LIARA_TEAM_ID`, empty = personal), like CLI `base.ts:285-293`.
- Every Liara call cites its source: a spec page in `docs/vendor/liara/pages/` or a CLI file:line (see `docs/liara/api-findings.md`).
- zod-parse every Liara response (schemas in `liara/schemas.ts`, loose objects, each backed by a fixture in `schemas.test.ts`) and every LLM output. No `any`.
- Risk tiers are enforced here, in code. Tier ≥ 2 needs an approval token bound to (tool, args-hash), single-use, expiring. No bypass flag.
- Every operation writes timeline events for start, success, and failure. Every fix ends with a verify step.
- Never log tokens/keys; redact logs and build a bounded evidence pack before anything reaches the LLM.
- Tests: vitest with recorded fixtures; live API tests only behind `LIVE=1`.
- Relative imports use the `.js` extension (NodeNext).
- `redact/` is the one place for redaction (env values, JWT/Bearer, PII keys, `envs[].value`). Use it before any log, fixture, or LLM call.
- `scripts/spike-*.ts` are live, read-only spikes run by the developer; they load `.env.local` at runtime. Fixtures land in `test/fixtures/liara/` and must pass `fixtures.safety.test.ts`.

Commands: `pnpm --filter @miara/core typecheck` · `pnpm test` · `pnpm spike:llm` · `pnpm spike:liara <app>`
