# @miara/core — all logic and every side effect

Modules (docs/ARCHITECTURE.md): `liara/` client · `tools/` registry + risk tiers · `policy/` gate + approval tokens ·
`workflows/` · `diagnosis/` evidence packs · `llm/` provider adapter · `timeline/` · `db/` (Drizzle). Entry: `createMiaraCore(config)`.

Rules
- Liara calls go through `liara/client.ts` only: team mode (`teamID`), 20 s timeout, GET-only retries, zod schemas from `liara/schemas.ts`, typed `LiaraError` (fa + en). Each method cites a spec page or CLI file:line.
- A write that times out is `unknown_outcome`, never a plain failure: the timeline says "unclear" and the tool's `reconcile` re-reads the app.
- Tools run only through `policy/gate.ts` (propose → approve → execute). Tiers per D19; `tierFor` and the circuit breaker can only raise a tier. `approve` is never a tool. No bypass flag, ever (a test greps for one).
- Every tool run is wrapped in `timeline.withOperation` (start/success/failure/unknown). Mark secret args in `sensitive`; they are masked in every return value and event.
- zod-parse every Liara response and LLM output. No `any`. LLM: strict json_schema + one repair retry, `reasoning_effort: low`, never `tools`, cost on the timeline.
- Never log tokens/keys; `redact/` is the one place for redaction. Build a bounded evidence pack before anything reaches the LLM.
- Tests: recorded fixtures (`test/fixtures/{liara,llm}`), fetch mocks for writes. Postgres tests only in `src/db/db.pg.test.ts` (skip if 5433 is down). Live reads only behind `LIVE=1`.
- Relative imports use the `.js` extension (NodeNext).
- `scripts/spike-*.ts` are live, read-only spikes run by the developer; they load `.env.local` at runtime.

Commands: `pnpm --filter @miara/core typecheck` · `pnpm test` · `pnpm --filter @miara/core db:generate` · `pnpm db:migrate` · `pnpm spike:llm [--record]` · `pnpm spike:liara <app>`
