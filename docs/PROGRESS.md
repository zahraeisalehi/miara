# Progress (autonomous run M2 → M6)

Resume with: "continue from docs/PROGRESS.md". The plan lives in `~/.claude/plans/pasted-content-id-5182-you-are-elegant-lake.md`.

## Current milestone
**M2: MCP server.** Code done and the gate is green. **Waiting at STOP 1** (one live `restart_app` on miara-something, run by the developer).

## Resume point
After the developer reports that STOP 1 ran:
1. Read the restart's success event: `docker compose -p miara exec db psql -U miara -c "select operation_id, status, data from timeline_events where tool='restart_app' order by created_at desc limit 3"`.
2. Save `data.result` (redacted) as `packages/core/test/fixtures/liara/write-v1-projects-app-actions-restart.json`.
3. Tighten the restart `WriteAck` in `packages/core/src/liara/schemas.ts` (loose, with the used fields required) and add a fixture test.
4. Mark restart ✅ in `docs/liara/api-findings.md` and `docs/liara/capabilities.md`.
5. Gate green → print the M2 commit message → start M3.

## FIX pass (2026-10-23, before the live restart)
- ✅ MIARA_APP_SCOPE tests: fixtures/tests follow the scope (wallexer invisible, out-of-scope calls → `policy:out_of_scope`,
  stdio test env sets the scope, breaker test uses in-scope `miara-other`).
- ✅ Restart request checked against CLI `commands/app/restart.ts:27`: bodiless `POST /v1/projects/{app}/actions/restart`
  with `?teamID=` and a Bearer token; identical. **Verify before success**: `restart_app` now polls `get_app` + `get_events`
  (≤20 × 3 s) for a new container start with no die/stop since and status ACTIVE, then probes `https://<app>.liara.run<healthPath>`
  (default `/health`, < 500 = up), then re-reads the metrics summary. Otherwise a `VerifyError`, so the timeline has a failure.
  A name that doesn't resolve yet (DNS) verifies with `httpChecked: false`.
- ✅ `get_logs` returns newest first (`order: 'newest_first'`); the MCP text keeps the newest 100.
- ✅ `check_health` (tier 0): the HTTP probe on its own (`packages/core/src/probe`), fixed to `*.liara.run`, no redirects.
- ✅ Env allowlist: `PORT`, `NODE_ENV`, `TZ` values are shown (still string-redacted); every other app env value stays masked.
- ⏸ Waiting: the developer runs the live `restart_app` on miara-something (STOP 1, again with the verify step).

## Decisions taken during this run
- Domain writes (create zone, add/attach domain, enable SSL) are **tier 1** per D19; deletes stay tier 3 (developer, 2026-10-23). `domains.md` updated.
- DEMO.md is aligned with D19 and the definition of done: restart is automatic (tier 1), the handoff needs no approval,
  and the happy path has exactly 2 approvals (create app, plan upgrade).
- D20 (MCP approvals) added to DECISIONS.md.

## Done
- M2
  - `apps/mcp`: `server.ts` (registerTool per registry tool via `fromJsonSchema`, `run_approved`, instructions), `approval.ts`
    (inputRequired elicitation, HMAC requestState bound to approval id + tool + args hash), `format.ts`, `env.ts`, `stdio.ts`
    (serveStdio, stderr-only logs), `cli.ts` (`pnpm miara approvals|approve <id>`, TTY-only, approves only).
  - `.mcp.json`, root script `miara`, deny rule `Bash(pnpm miara approve:*)`.
  - Tests (28): listing/annotations, no approve tool, tier 0/1, pending without elicitation, run_approved single-use,
    elicitation accept/wrong name/decline/cancel on both protocol eras, forged and replayed requestState, errors, CLI, stdout-clean stdio.
  - Core: `handoff.test.ts`; `gate.test.ts` handler ctx now includes `incidents`.

## Next
- M3: deploy workflow (buggy-app, detect, recommend, network, liara.json, archive, release + build logs, build diagnosis, probe,
  D15, env allowlist, rollback check, resumable `runDeploy`, MCP `deploy_project` with progress).

## Open issues
- Claude Code speaks the 2025 protocol era; elicitation there goes through the SDK's legacy shim. If a client doesn't
  support elicitation, the terminal fallback applies (tested).

## Suggested commit messages
- M2: `feat(mcp): phase 2 MCP server: core tools over stdio, elicitation approvals with signed requestState, terminal approve fallback, run_approved`
