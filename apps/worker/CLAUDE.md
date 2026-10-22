# @miara/worker — monitoring poller → incidents

- Polls Liara summary/CPU/memory/events/logs per app plus an HTTP probe, stores snapshots, and opens incidents by rule
  (docs/ARCHITECTURE.md "Monitoring & diagnosis"). Liara has no webhooks (D9).
- Uses `@miara/core` for every Liara call and for DB access; no direct HTTP to Liara here.
- Back off on 429. Never log tokens; redact logs before they enter an evidence pack.
- Phase 5 builds this (docs/PHASES.md).

Commands: `pnpm --filter @miara/worker typecheck` · `pnpm test`
