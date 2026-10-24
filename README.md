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

The `db` service has `restart: unless-stopped`. On Docker that restarts it after crashes and reboots. On rootless
**podman** (`docker compose` running through podman-compose) the restart after a reboot only happens with
`systemctl --user enable --now podman-restart.service`, and the container survives logout only with
`loginctl enable-linger $USER`. If the database is down, Miara's tools say so (`error db_unavailable`) and the MCP
server warns on stderr at startup.

## Commands
`pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm format`

## Layout
`packages/core` (all logic) · `apps/web` (Next.js, port 3100) · `apps/mcp` (MCP server) · `apps/worker` (monitoring) ·
`examples/buggy-app` (demo app)
