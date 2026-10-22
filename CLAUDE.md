# Miara — AI SRE copilot for Liara (liara.ir)

Miara takes a developer who built an app but knows nothing about deployment, and handles the rest on Liara:
choosing platform/plan, deploying, monitoring, diagnosing incidents, fixing (with approval), and handing
code bugs back to the developer's coding agent via MCP. Hackathon MVP. Judges score: Liara integration (100),
intelligence/troubleshooting (100), UX (50), stability & operational security (50). Full brief: `docs/REQUIREMENTS.md`.

## Read before you touch…
| Area | Read first |
|---|---|
| Anything architectural | `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` |
| Liara API calls | `docs/liara/capabilities.md` (base URLs per service), then grep `docs/vendor/liara/pages/*.md` and `docs/vendor/liara-cli/src/` |
| Liara endpoints not in the spec / deploy sequence | `docs/liara/api-findings.md` (CLI-derived, file:line cited) |
| Deploy flow / platforms / liara.json | `docs/liara/app-creation-flow.md`, `docs/liara/platform-node.md`, `docs/vendor/liara-cli/src/commands/deploy.ts` |
| Domains / DNS / SSL | `docs/liara/domains.md` |
| Plan recommendation / costs | `docs/liara/plans.md` |
| LLM calls | `docs/boxapi/README.md` and the "LLM layer" section of `docs/ARCHITECTURE.md` |
| Current phase & acceptance criteria | `docs/PHASES.md` |
| Demo story | `docs/DEMO.md` |

## Monorepo (pnpm workspaces, TypeScript strict, ESM)
- `packages/core` — Liara client, tool registry + risk tiers, policy/approval gate, workflows, diagnosis, LLM layer, DB (Drizzle/Postgres)
- `apps/web` — Next.js App Router: chat, operation timeline, approval cards, incidents (Persian-first, RTL)
- `apps/mcp` — MCP server (stdio first) for coding agents; thin wrapper over `core`
- `apps/worker` — monitoring poller → incidents
- `examples/buggy-app` — demo Node app with switchable faults

## Non-negotiables
1. **BoxAPI has NO tool calling.** The LLM never executes anything. It only returns JSON that we validate with zod.
   All side effects go through `core` tools and workflows.
2. **Risk tiers are enforced in code** (`core/policy`), not in prompts. Tier ≥ 2 requires an approval token that is
   bound to (tool, args-hash), single-use, and expiring. Never add a bypass flag.
3. **Liara API truth:** only call endpoints found in `docs/vendor/liara/pages/*.md` or in the official CLI source
   `docs/vendor/liara-cli/src/` (cite the CLI file in a comment). Never invent an endpoint, body, or plan ID.
   If neither source has it, add it to `docs/liara/capabilities.md` and make the product tell the user plainly.
4. **Secrets:** never log, return, or send the Liara token or BoxAPI key to an LLM. Redact logs before any LLM call.
   Never read `.env*` files.
5. **Every operation is visible:** write a timeline/audit event for start, success, and failure, including the raw
   error and a plain-language explanation.
6. **Every corrective action ends with a verify step** (re-check metrics, status, and HTTP probe) and reports the outcome.
7. **Never send raw logs to the LLM.** Build an evidence pack (`core/diagnosis`) with bounded size.

## Conventions
- zod for every external boundary (Liara responses, LLM output, MCP inputs). No `any`.
- vitest; Liara client tests use recorded fixtures. Live API tests only behind `LIVE=1`.
- User-facing strings: Persian (fa) first, English fallback. Code, comments, and logs in English.
- If you suggest a terminal editor, use `vim`.

## Working agreement (the human runs all git)
- Do NOT run `git commit`, `git push`, or branch commands. The developer does git.
- Start each phase in plan mode. Ask when a doc is missing instead of guessing.
- End every task with: **Summary · Files changed · How to test · Open questions/limitations found · Suggested commit message**.

## Commands
- `pnpm install` · `pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm typecheck`
- Local DB: `docker compose -p miara up -d db` (Postgres on host port **5433**)
- Liara CLI source (gitignored): `bash scripts/vendor-liara-cli.sh` clones it at the pinned commit into `docs/vendor/liara-cli`
