# Decisions (agreed between developer and mentor)

| ID | Decision | Status |
|---|---|---|
| D1 | TypeScript end-to-end (strict, ESM) | Agreed |
| D2 | pnpm workspaces monorepo: `apps/web`, `apps/mcp`, `apps/worker`, `packages/core`, `examples/buggy-app`; small `CLAUDE.md` per package | Agreed |
| D3 | Next.js App Router + Vercel AI SDK, **used for streaming text and typed UI message parts only** (no model tool calling). Pin the version. | Agreed, revised by D4 |
| D4 | LLM = BoxAPI (`https://ai.boxapi.ir/ai/v1`, OpenAI-compatible). **No tool calling.** The LLM returns JSON validated by zod; code executes. Provider adapter is swappable (Liara AI is OpenAI-compatible too). | Agreed (revised) |
| D5 | Risk tiers 0–3 enforced in `core/policy`; propose → approve → execute(token) | Agreed |
| D6 | Deploy from the user's local folder through the MCP server (stdio), reusing core deploy workflow | Agreed |
| D7 | MCP transport: stdio first; Streamable HTTP later | Agreed |
| D8 | Postgres (Liara DBaaS in prod, Docker locally on port 5433) + Drizzle | Agreed |
| D9 | Own monitoring worker that polls Liara reports/events/logs + HTTP probe (Liara has no webhooks/alerts in its API) | Agreed |
| D10 | Diagnosis: deterministic evidence extraction first, LLM ranks hypotheses second, verify after every fix | Agreed |
| D11 | Single-tenant secrets in env; never in LLM context or logs; redact before LLM | Agreed |
| D12 | Demo is a story told from the user's point of view (see `docs/DEMO.md`), not a feature tour | Agreed |
| D13 | Agent loop = **router → workflow → narrator** (see ARCHITECTURE "LLM layer"). Quick-action chips work even if the LLM fails. | New |
| D14 | Live plan IDs and prices come from `GET v1/me` (`plans.projects`, `projectBundlePlans`; CLI `plan list` source). The static table in `docs/liara/plans.md` is a fallback only (offline, or the API fails), and its prices are labelled with their capture date. ✅ Spike B: catalog shape, planIDs and bundle IDs verified (`docs/liara/plans.md`) | Revised |
| D16 | Official Liara CLI source (`liara-cloud/cli`, MIT) is vendored read-only as the 2nd source of API truth (networks, plan list, deploy sequence aren't in the API docs). Miara calls the HTTP API itself; shelling out to the CLI is plan B only if the deploy upload can't be reproduced | Proposed |
| D17 | Domain setup recommends Liara DNS (user changes only nameservers at the registrar); keeping the current DNS provider is the alternative | Proposed |
| D15 | The `*.liara.run` address lives only 7 days from first deploy → Miara warns the user and pushes domain setup as a guided step. State comes from `GET v1/projects/{app}` → `defaultSubdomain`, `defaultSubdomainExpired`, `keepDefaultSubdomain` (✅ Spike B) | New |
| D18 | Default bundle recommendation is standard; basic lacks zero-downtime and has 7-day log retention, and Miara says so. The diagnoser treats brief post-deploy errors on basic as expected. | New |
| D19 | Retier: human-in-the-loop means the human approves only the few risky decisions; the agent handles routine operations autonomously and visibly. **Tier 1** (auto + timeline): restart, deploy, set env, power on (later: rollback, backup, add domain, enable SSL). **Tier 2** (approval): power off; set env when the app has a custom domain. **Tier 3** (approval + typed confirmation + cost preview): create app, change plan, any delete. A tool may compute its tier per call (`tierFor`); the gate uses max(static, computed). Tier-1 circuit breaker per app per rolling hour (2 auto restarts, 3 auto deploys), then escalation to tier 2 with a fa/en reason. Human approval (`approve`, never a tool or LLM-callable) is separate from execution (`execute` requires `approved_at`). | New |
