# Phases (start each in plan mode; the developer commits on branch `phase-N`)

## Phase 0: Scaffold
- pnpm workspaces, tsconfig base (strict), eslint/prettier, vitest, empty packages per ARCHITECTURE.
- `docker-compose.yml` with Postgres on host port 5433 (compose project name `miara`).
- `.env.example` listing LIARA_API_TOKEN, BOXAPI_API_KEY, BOXAPI_MODEL, DATABASE_URL, LLM_PROVIDER.
- A per-package `CLAUDE.md` (≤ 20 lines each).
- Done when: `pnpm install && pnpm typecheck && pnpm test` pass.

## Phase 1: Core + spikes
- **Spike A (BoxAPI)**, script `packages/core/scripts/spike-llm.ts`: plain chat, streaming, `response_format`
  json_object and json_schema, Persian quality, latency, and which model names work. Write the findings into `docs/boxapi/README.md`.
- **Spike B (Liara)**: list apps, details, logs, events, reports, and billing against the real API (read-only, `LIVE=1`).
  Record fixtures. From `docs/vendor/liara-cli/src/` document in `capabilities.md`: network list/create, plan list
  (+ feature-plan/bundle IDs), and the exact deploy sequence (archive format, upload, release body, build-log/status
  polling, build location). Also include `GET /v1/billing`.
- Liara client, tool registry with tiers, policy gate, approval tokens, timeline, Drizzle schema.
- Done when: read tools pass on fixtures, the policy gate has unit tests (tamper, expiry, reuse), and the spike notes are written.

## Phase 2: MCP server (stdio)
- Expose tier-0 tools + `get_open_incidents` + `report_fix` and tier ≥ 2 tools returning `pending_approval`.
- Dogfood: register it in this repo's Claude Code and ask "what apps do I have?"

## Phase 3: Deploy workflow
- The full deploy workflow from ARCHITECTURE, run via MCP on `examples/buggy-app`.

## Phase 4: Web app
- Chat (router → workflow → narrator), approval cards, a live operation timeline, an app status panel, quick-action chips, RTL Persian.

## Phase 5: Worker + diagnosis
- Poller, incident rules, evidence pack, diagnoser, fix + verify.

## Phase 6: Coding-agent handoff
- Incident → MCP → Claude Code fixes the code → redeploys → Miara verifies and closes the incident.

## Phase 7: Demo + dogfood
- Deploy Miara itself on Liara (Next.js platform + Postgres DBaaS). Rehearse `docs/DEMO.md`.
