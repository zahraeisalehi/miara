# Miara

An AI SRE copilot for [Liara](https://liara.ir). It takes an app you built and handles the rest: choosing a plan,
deploying, monitoring, diagnosing incidents, fixing with your approval, and handing code bugs back to your coding agent
over MCP. Brief: `docs/REQUIREMENTS.md` · design: `docs/ARCHITECTURE.md` · roadmap: `docs/PHASES.md`.

## Setup
Requires Node 22 (`.nvmrc`), pnpm (version pinned in `package.json`), and Docker.

```sh
pnpm install
bash scripts/vendor-liara-cli.sh   # fetches the Liara CLI source (gitignored) at the pinned commit into docs/vendor/liara-cli
cp .env.example .env               # then fill in the tokens
docker compose -p miara up -d db   # Postgres on localhost:5433
```

## Commands
`pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm format`

## Layout
`packages/core` (all logic) · `apps/web` (Next.js, port 3100) · `apps/mcp` (MCP server) · `apps/worker` (monitoring) ·
`examples/buggy-app` (demo app)
