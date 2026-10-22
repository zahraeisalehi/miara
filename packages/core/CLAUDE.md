# @miara/core — all logic and every side effect

Modules (docs/ARCHITECTURE.md): `liara/` client · `tools/` registry + risk tiers · `policy/` gate + approval tokens ·
`workflows/` · `diagnosis/` evidence packs · `llm/` provider adapter, router, narrator, diagnoser · `timeline/` · `db/` (Drizzle).

Rules
- Every Liara call cites its source: a spec page in `docs/vendor/liara/pages/` or a CLI file:line (see `docs/liara/api-findings.md`).
- zod-parse every Liara response and every LLM output. No `any`.
- Risk tiers are enforced here, in code. Tier ≥ 2 needs an approval token bound to (tool, args-hash), single-use, expiring. No bypass flag.
- Every operation writes timeline events for start, success, and failure. Every fix ends with a verify step.
- Never log tokens/keys; redact logs and build a bounded evidence pack before anything reaches the LLM.
- Tests: vitest with recorded fixtures; live API tests only behind `LIVE=1`.
- Relative imports use the `.js` extension (NodeNext).

Commands: `pnpm --filter @miara/core typecheck` · `pnpm test`
