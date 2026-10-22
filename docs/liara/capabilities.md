# What the Liara API can and cannot do (the product reads this to tell users the truth)

Sources of truth, in order:
1. `docs/vendor/liara/pages/*.md` (one page per endpoint, each embeds its OpenAPI YAML; file names mirror the URL, e.g. `pass_apps_get-logs-of-app.md`; index: `docs/vendor/liara/llms.txt`)
2. The official CLI source at `docs/vendor/liara-cli/src/` (MIT, github.com/liara-cloud/cli). Use it for endpoints
   the specs don't document. Every client method built from the CLI must cite the CLI file in a comment.
Update this file whenever a spike confirms or disproves something.

## Base URLs and auth
All services use `Authorization: Bearer <LIARA_API_TOKEN>` (JWT from the console). Hosts differ per service:
| Service | Base URL |
|---|---|
| PaaS, DBaaS, billing, account | `https://api.liara.ir` |
| DNS | `https://dns-service.liara.ir` |
| Object storage | `https://storage-service.liara.ir` |
| Mail | `https://mail-service.liara.ir` |
| IaaS | `https://iaas-api.liara.ir` (not used) |
Rate limits exist but aren't published, so the client needs backoff on 429.

## Available
- **Apps**: list, details, create (platform, plan, feature-plan = bundle, network, read-only), delete, on/off,
  restart, change plan, logs, events, releases, applets, update port.
- **Deploy**: source upload + release (from the specs), or a Docker image deploy. The CLI also supports build location
  `iran | germany`, `--detach`, a release message, disks, no-cache, and app-log streaming after a deploy. Get the exact calls from `src/commands/deploy.ts`.
- **Networks**: list/create exist (CLI `network create|list`). They're missing from the API docs, so take them from `src/commands/network/*`.
- **Plans**: list exists (CLI `plan list`). It's missing from the API docs, so take it from `src/commands/plan/list.ts`. Prefer it over `plans.md`
  for IDs; use `plans.md` only for human-readable prices.
- **Settings**: zero-downtime, default subdomain, static IP, read-only, envs (set/unset; this restarts the app).
- **Disks**: list/create/resize/delete, backups (create/list/download), FTP.
- **Domains** (PaaS): check, list, create, attach to app, redirect, SSL on/off, delete. See `domains.md`.
- **Reports**: summary, CPU, memory, network rx/tx (apps and DBs).
- **DBaaS**: create (`hostname, type, planID, version, publicNetwork`; types mysql, postgres, mongodb, redis,
  mariadb), list, get (connection info), delete, power, resize, settings, public-network toggle, backups, reports, events.
- **DNS zones/records**: see `domains.md`.
- **Billing**: `GET /v1/billing` → `user.balance` (number), `minCreditAmount`, `accountType`.
- **Console over WebSocket**: `wss://api.liara.ir?token=…&cmd=…&project_id=…`. **Excluded from the MVP** (too risky).

## Not available (tell the user plainly)
- Buying/registering a domain and IRNIC steps: the user does these at the registrar.
- Adding credit / payments: console only. Miara can only *show* the balance and warn when it's low.
- Webhooks/alerts: none, so Miara polls.
- Connecting GitHub to Liara: console only (OAuth). The API can only read integrations.
- Token scopes: probably full-access, so Miara's policy gate is the only guardrail.
- Still UNCONFIRMED until spike B: build status/build-log endpoint shape, and what each feature bundle includes.
