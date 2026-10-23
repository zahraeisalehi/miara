# Architecture

```
                 packages/core
  ┌───────────────────────────────────────────────────────────┐
  │ liara/      typed client (zod-validated responses)        │
  │ tools/      registry: name, input schema, RISK TIER, fn   │
  │ policy/     tier gate + approval tokens (code-enforced)   │
  │ workflows/  deploy, diagnose, fix+verify, domain-setup    │
  │ diagnosis/  log parser, metric anomaly, evidence pack     │
  │ llm/        provider adapter, router, narrator, diagnoser │
  │ timeline/   audit + operation events                      │
  │ db/         Drizzle schema (approvals, events, incidents) │
  └──────────────▲─────────────────────────▲──────────────────┘
                 │                         │
   apps/mcp (stdio)                apps/web (Next.js)
   coding agent is the brain;      Miara's own agent loop
   Miara exposes tools             (router → workflow → narrator)
                 ▲
   apps/worker: polls Liara → incidents → visible in web + MCP
```

## LLM layer (BoxAPI has NO tool calling)
The model never calls tools. Three narrow LLM jobs, each with a zod schema and one repair retry on invalid JSON:

1. **Router.** Input: the user message plus compact state (apps, open incidents, pending approvals). Output JSON:
   `{ intent, appName?, params, clarifyQuestion? }`. `intent` is a closed enum, e.g. `deploy | status | logs |
   diagnose | restart | start_stop | change_plan | set_env | domain_setup | backup | explain | smalltalk`.
2. **Diagnoser.** Input: an evidence pack. Output: ranked hypotheses
   `[{ cause, confidence, evidence[], action: { tool, args } | null, risk_tier, user_explanation_fa }]`.
   The proposed `tool` must exist in the registry, and the policy gate still decides.
3. **Narrator.** Streams simple Persian explanations of workflow results as markdown (the UI renders it; Spike A). It has no authority.

Then **code** runs the workflow. Tier 0–1 steps run automatically. Tier ≥ 2 steps emit an approval card (a UI
data part) and stop until approved. The model provider sits behind one interface (`complete`, `stream`,
`completeJSON`), so BoxAPI and Liara AI are interchangeable through config. JSON is requested via `response_format`
if the provider supports it, otherwise via a prompt with fenced JSON and an extract step.

Fallback: every intent is also reachable from quick-action chips and buttons, so the product works when the LLM fails.

In the MCP path the coding agent (Claude Code, Cursor) does its own reasoning and tool calling. Miara's MCP tools
are the same core tools with the same policy gate.

## Risk tiers
| Tier | Examples | Behaviour |
|---|---|---|
| 0 Read | list apps, logs, metrics, events, billing, releases | auto |
| 1 Safe-write | create backup, set env on non-prod app | auto + timeline |
| 2 Impactful | restart, deploy, start/stop, env on prod, domain/SSL | approval card |
| 3 Destructive/costly | delete app/db/disk, change plan, resize | approval + typed confirmation + cost shown |

Approval token: bound to `sha256(tool + canonical(args))`, single-use, expiring (default 10 min), and stored in the DB.
Approval in MCP: the tool returns `pending_approval` with a web link, and MCP elicitation is used if the client supports it.

## Deploy workflow (core/workflows/deploy)
detect platform → recommend plan (plans.md) → ensure network → create app (tier 3: costs money) → generate
`liara.json` → pack source (respect `.gitignore`/`.liaraignore`, exclude node_modules) → upload source → create release →
poll release/build status and stream build logs → HTTP probe `https://<app>.liara.run` → report, and warn about the 7-day address.
The exact endpoints and bodies come from the PaaS pages in `docs/vendor/liara/pages/` and the Liara CLI source. Never guess them.

## Monitoring & diagnosis
The worker polls summary, CPU, memory, events, and logs every N seconds per app, plus an HTTP probe, and stores snapshots.
Rules: RAM > 90% for 3 samples, restart/OOM events, 5xx ratio up, probe failure, latency up → open an incident.
Evidence pack (bounded, ~4k tokens): top error signatures with counts, first and last stack trace, status-code histogram,
metric deltas around incident start, recent events, the last release time. Logs are redacted first.
After a fix: re-poll metrics, probe, and error rate, then mark the incident `resolved | not_resolved` with the reason.
