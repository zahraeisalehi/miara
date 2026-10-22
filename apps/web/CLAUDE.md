# @miara/web — chat, operation timeline, approval cards, incidents (Persian-first, RTL)

- **Dev port: 3100** (3000 is taken by another local project). Always pass it explicitly, e.g. `next dev -p 3100`.
- Phase 0 is a placeholder TS package. Next.js App Router and the Vercel AI SDK get added and pinned in Phase 4.
- The AI SDK is for streaming text and typed UI parts only; no model tool calling (D3/D4).
- Agent loop = router → workflow → narrator (D13). Quick-action chips must work when the LLM fails.
- Never call Liara directly; go through `@miara/core`. Secrets stay server-side.
- User-facing strings: fa first, en fallback.

Commands: `pnpm --filter @miara/web typecheck` · `pnpm test`
