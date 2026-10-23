# What the Liara API can and cannot do (the product reads this to tell users the truth)

Sources of truth, in order:
1. `docs/vendor/liara/pages/*.md` (one page per endpoint, each embeds its OpenAPI YAML; file names mirror the URL, e.g. `pass_apps_get-logs-of-app.md`; index: `docs/vendor/liara/llms.txt`)
2. The official CLI source at `docs/vendor/liara-cli/src/` (MIT, github.com/liara-cloud/cli). Use it for endpoints
   the specs don't document. Every client method built from the CLI must cite the CLI file in a comment.
What the CLI source shows for networks, the deploy sequence, plans, and build logs, with file:line citations: `docs/liara/api-findings.md`.
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

**Team mode.** Resources owned by a Liara team are only visible with a `teamID` query parameter. The CLI sets it on
**every** request in a got `beforeRequest` hook, as an empty string for the personal account
(`docs/vendor/liara-cli/src/base.ts:285-293`). It is a query parameter, not a header. Without it, a team's apps don't show up
(`GET /v1/projects` returned 0 apps for a team-owned app; with it, 2. ✅ Spike B). Miara reads an optional `LIARA_TEAM_ID`, and **the core Liara
client must append `teamID` to every call**, the same way. Details are in `api-findings.md` §0.

## Available
- **Apps**: list (each item's app name is `project_id`, not `name`), details, create (platform, plan, feature-plan = bundle, network, read-only), delete, on/off,
  restart, change plan, logs, events, releases, applets, update port.
- **Deploy**: source upload + release (from the specs), or a Docker image deploy. The CLI also supports build location
  `iran | germany`, `--detach`, a release message, disks, no-cache, and app-log streaming after a deploy. Get the exact calls from `src/commands/deploy.ts`.
- **Networks**: list ✅ (`GET v1/networks`) / create ⏸ (CLI `network create|list`). They're missing from the API docs, so take them from `src/commands/network/*`.
- **Plans** ✅: the catalog is `GET v1/me` → `plans.projects` (planIDs, e.g. `small-g2`) and `plans.projectBundlePlans[planID]`
  (bundlePlanIDs `free | basic | standard | pro`, with prices and per-bundle limits). Key bundles **by ID**: the CLI's positional
  labels are wrong for the live order (`api-findings.md` §3). `plans.md` is the offline fallback and the console-name mapping.
- **App plan, cost and default subdomain** ✅: `GET v1/projects/{app}` gives `planID`, `bundlePlanID`, `hourlyPrice` (plan) +
  `bundleHourlyPrice` (bundle), and `defaultSubdomain`, `defaultSubdomainExpired`, `keepDefaultSubdomain`. **D15 uses the last
  three** to warn before the `*.liara.run` address expires and to tell the user plainly when it already has.
- **Build status and build logs** ✅: `GET v1/releases/{id}` (state, queue) and `GET v2/releases/{id}/build-logs`
  (`{ release: { state }, buildOutput[] }`); release history `GET v1/projects/{app}/releases`. See `api-findings.md` §4.
- **Runtime logs** ✅: **primary** `GET v2/projects/{app}/logs?start=<unix s>&direction=forward&last_lines=false` (grouped, JSON-encoded lines).
  **Fallback** `GET v1/projects/{app}/logs?since=<unix seconds>` (an ISO `since` is a 400). v1 currently returns a CLI-upgrade
  notice as a log line, so filter it out.
- **Events** ✅: `GET v1/projects/{app}/events` (container create/start/kill/stop/die, `time` is unix seconds as a string).
- **Settings**: zero-downtime, default subdomain, static IP, read-only, envs (set/unset; this restarts the app).
- **Disks**: list/create/resize/delete, backups (create/list/download), FTP.
- **Domains** (PaaS): check, list, create, attach to app, redirect, SSL on/off, delete. See `domains.md`.
  The list call `GET v1/domains?project={app}` (spec `pass_domains_get-all-domains.md`, CLI `commands/deploy.ts:246`) is used by
  `set_env` to decide its tier (D19); ⏸ not called live yet (the `LIVE=1` test is the first live call).
- **Reports**: summary, CPU, memory (✅ for apps: values are strings, one series per container `applet`, 30 s step), network rx/tx (apps and DBs).
- **DBaaS**: create (`hostname, type, planID, version, publicNetwork`; types mysql, postgres, mongodb, redis,
  mariadb), list, get (connection info), delete, power, resize, settings, public-network toggle, backups, reports, events.
- **DNS zones/records**: see `domains.md`.
- **Billing** ✅: `GET /v1/billing` → `user: { balance, minCreditAmount, accountType, isManualMinCredit }`. In team mode it also
  returns `team: { … same }`. **When `LIARA_TEAM_ID` is set, show and check `team.balance`** (the team pays), else `user.balance`.
- **Console over WebSocket**: `wss://api.liara.ir?token=…&cmd=…&project_id=…`. **Excluded from the MVP** (too risky).

## Not available (tell the user plainly)
- Buying/registering a domain and IRNIC steps: the user does these at the registrar.
- Adding credit / payments: console only. Miara can only *show* the balance and warn when it's low.
- Webhooks/alerts: none, so Miara polls.
- Connecting GitHub to Liara: console only (OAuth). The API can only read integrations.
- Token scopes: probably full-access, so Miara's policy gate is the only guardrail.
- Still UNCONFIRMED (needs a write, so not testable read-only in Spike B): source upload, release create/cancel, network create,
  app create/resize, the failed-build states, and whether DNS and the other hosts honour `teamID`. Confirmed in Spike B
  (2026-10-22): team mode, plans/bundles and their limits, build status and build logs, runtime logs (v2 primary), billing, events, reports.
