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
| D14 | Plan recommendation uses the static table in `docs/liara/plans.md` (prices labelled with their capture date); API plan IDs come only from the API (CLI `plan list` source) | New |
| D16 | Official Liara CLI source (`liara-cloud/cli`, MIT) is vendored read-only as the 2nd source of API truth (networks, plan list, deploy sequence aren't in the API docs). Miara calls the HTTP API itself; shelling out to the CLI is plan B only if the deploy upload can't be reproduced | Proposed |
| D17 | Domain setup recommends Liara DNS (user changes only nameservers at the registrar); keeping the current DNS provider is the alternative | Proposed |
| D15 | The `*.liara.run` address lives only 7 days from first deploy → Miara warns the user and pushes domain setup as a guided step | New |
