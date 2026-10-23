# Liara API findings (CLI-derived, checked live in Spike B)

Read from the CLI source at commit `14ec35f79d703a09a5e3abbb22ba59239cdde80d` (2026-10-18; fetch it with
`scripts/vendor-liara-cli.sh`) and from the spec pages. CLI paths are relative to `docs/vendor/liara-cli/src/`, spec
pages to `docs/vendor/liara/pages/`. All hosts are `https://api.liara.ir` (`constants.ts:10-13`).

**Spike B ran on 2026-10-22, read-only (GET only), in team mode: all 14 GETs returned 200.** Redacted responses are in
`packages/core/test/fixtures/liara/<name>.json`, and zod schemas for each one are in `packages/core/src/liara/schemas.ts`
(`schemas.test.ts` parses every fixture). Status legend: **✅ verified** live · **❌ differs** from the source ·
**⏸ not testable read-only** (it would create, deploy or cost money). It stays unverified until Phase 2 does it for real.

## 0. Team mode (applies to every call)
source: CLI only · status: **✅ verified**

- **Mechanism**: query parameter **`teamID`**, set on every request by a got `beforeRequest` hook:
  `url.searchParams.set('teamID', config['team-id'] || '')` (`base.ts:285-293`). An empty value means the personal account.
  It is not a header.
- **Evidence**: without `teamID`, `GET /v1/projects` returned 0 apps. With it, the call returned the team's 2 apps
  (`v1-projects.json`). `v1/me` and `v1/billing` then also carry a `team` object (`v1-me.json`, `v1-billing.json`).
- **Where the ID comes from**: the `--team-id` flag, `team-id` in `liara.json` (`types/liara-json.ts:27`), or the team saved
  by `liara team:use` (`base.ts:312-317`). An explicit value always wins, and an empty one forces the personal account.
- **Finding the ID** (⏸ not called in the spike): `GET v2/teams?page=&count=` returns `{ teams: [{ _id, name, color }], totalTeams }`
  (`team-command.ts:128-155`, `types/team.ts:1-5`). The CLI calls it with `teamID` empty (`commands/team/list.ts:24`), and `liara team:list -x` shows `_id` (`:35-39`).
- **WebSocket shell** passes it as `&teamID=` in the URL (`commands/app/shell.ts:67-69`). This doesn't matter for the MVP; the console is excluded.
- **Miara**: `LIARA_TEAM_ID` (optional) in `.env.local`. The core client must set `teamID` on **every** call. Whether
  DNS and the other hosts honour it is still open (⏸, check when the DNS client is built).

## 1. Networks
source: CLI only (not in the spec pages)

| Call | Request | Response | Cite | Status |
|---|---|---|---|---|
| List | `GET v1/networks` | `{ networks: [{ _id, name, createdAt, projectCount, databaseCount }] }` | `commands/network/list.ts:22-24`, `types/get-network-response.ts`, `types/network.ts` | **✅** (`v1-networks.json`; `projectCount`/`databaseCount` are extra fields the CLI types don't have) |
| Create | `POST v1/networks` JSON `{ networkName }` | body unused by the CLI; **409** = name already exists | `commands/network/create.ts:28`, `:36` | ⏸ |

- App details carry the network as `network: { _id, name }` (`v1-project.json`), which matches the CLI sending **`_id`** on
  app create: `network: network?._id` (`commands/app/create.ts:86`). Create itself is ⏸.
- The CLI looks a network up by name client-side, from the list (`base.ts:462-498`).

## 2. Source upload + release
source: both (the spec is a subset of the CLI) · status: **⏸ upload, create and cancel** (they deploy) · **✅ the release
records they produce**

Indirect evidence: the test app has two `READY` releases of `type: "DEPLOY"` with `sourceAvailable: true`,
`buildLocation: "iran"`, `port: 3000` and `platformConfig.version: "22"` (`v1-project-releases.json`). These are exactly the fields the
CLI body below sets. The app also has `readOnlyRootFilesystem: true`.

**Archive** (`utils/create-archive.ts`)
- A tar.gz with gzip `level: 9`, built from the project root (`:165-174`).
- Ignore rules: the default list (`.git`, `node_modules`, `.next`, `liara.json`, …, `:10-21`), plus per-platform lists
  (`:23-70`), plus the first of these found in each directory: `.liaraignore`, then `.dockerignore`, then `.gitignore` (`:116-125`).
- It errors if everything is ignored (`:160`).
- Size: the client refuses sources over 256 MiB (`constants.ts:29`, `commands/deploy.ts:456-465`). The server returns
  **413** on a per-bundle limit (`commands/deploy.ts:387`). **✅ (live catalog)** `maxSourceSize` per bundle:
  free = basic = 128 MB, standard = pro = 256 MB (`v1-me.json` → `plans.projectBundlePlans`).

**Upload** ⏸: `POST v2/projects/{app}/sources`, `multipart/form-data` with the field `file` set to the .gz.
It returns `{ sourceID }`. Cite: `services/upload.ts:6-8`, `commands/deploy.ts:877-883`, spec `pass_deploy_deploy-sources-code.md`.

**Create release** ⏸: `POST v2/projects/{app}/releases` with JSON, returning `{ releaseID }` (`commands/deploy.ts:479-483`, `types/created-release.ts`).
The body the CLI sends (`commands/deploy.ts:403-436`, `:475`):
```jsonc
{
  "build": { "cache": bool, "args": [], "dockerfile": str, "location": "iran" | "germany" },
  "cron": [], "args": [], "port": number, "type": "<platform>", "message": str,
  "disks": [], "envs": [],
  "gitInfo": { ... },                 // collectGitInfo(config.path)
  "platformConfig": { "version": "22" }, // liara.json[platform]; version auto-detected if absent (:597-679)
  "healthCheck": { "command": [] },     // optional; a string command is split on spaces
  "sourceID": "<from upload>"
}
```
- An image deploy sends `image` instead of `sourceID` and skips the archive (`commands/deploy.ts:419-422`).
- The spec (`pass_deploy_deploy-releases.md`) documents only `sourceID`, `port` and `type`.
- The free bundle can't use the Germany builder (`errors/bundle-plan.ts:43-48`). **✅** `germanyBuilder: false` on free, true on basic/standard/pro.
- Deploys per day: the CLI says free = 10 and standard = 50 (`errors/bundle-plan.ts:2-11`). **✅, plus basic**: `maxDeploymentCountInDay`
  is free 10, basic 20, standard 50, pro `"infinite"`.

**Cancel** ⏸: `POST v2/releases/{releaseID}/cancel`, retried 3 times (`services/cancel-deployment.ts:13`, `commands/deploy.ts:520-527`).

## 3. Plans and feature-plan (bundle) IDs
source: CLI, plus the spec (shape untyped) · status: **✅ verified, with one ❌** (the CLI's positional bundle labels)

- **✅** There is no plan endpoint: `GET v1/me` → `plans` holds the catalog (`commands/plan/list.ts:21`; `v1-me.json`).
  Besides `projects` and `projectBundlePlans`, `plans` also has `databases`, `databaseBundlePlans`, `mail`, `objectStorage`,
  `legacyStorageService` and `subscription`.
- **✅** `plans.projects`: keys are **planID**s, with fields `available`, `price` (toman/hour), `volume` (GB), `RAM.amount` (GB),
  `CPU.amount` (cores), and `region` (missing on some legacy plans). Monthly = `price × 720` (checked against the console's prices: exact
  to rounding). The CLI's filter (`free` or contains `g2`, `available`, `region === 'iran'`, `commands/plan/list.ts:22-46`)
  leaves these **live planIDs** (2026-10-22):

  | planID | RAM GB | vCPU | disk GB | toman/h | ≈ toman/month | console name |
  |---|---|---|---|---|---|---|
  | `small-g2` | 0.5 | 0.5 | 5 | 659.72 | 475,000 | Earth (زمین) |
  | `medium-g2` | 1 | 1 | 10 | 1,145.83 | 825,000 | Mars (مریخ) |
  | `standard-base-g2` | 2 | 1 | 20 | 2,048.61 | 1,475,000 | Jupiter (مشتری) |
  | `standard-plus-g2` | 4 | 2 | 40 | 3,680.55 | 2,650,000 | Saturn (زحل) |
  | `pro-g2` | 8 | 4 | 80 | 6,388.88 | 4,600,000 | Uranus (اورانوس) |
  | `pro-plus-g2` | 16 | 8 | 160 | 11,111.11 | 8,000,000 | Neptune (نپتون) |
  | `pro-max-g2` | 32 | 16 | 320 | 19,444.44 | 14,000,000 | Pluto (پلوتون) |
  | `express-g2` | 64 | 32 | 640 | 34,166.66 | 24,600,000 | (not in the console table) |

  `mini-g2` (0.25 GB) and `free` exist but have `available: false` on this account. Many legacy keys (`ir-*`, `small`,
  `standard-base`, …) exist too; never offer them. The console names come from matching prices to `docs/liara/plans.md`.
- **✅** `plans.projectBundlePlans[planID]`: keys are **bundlePlanID**s. Every `*-g2` plan has exactly
  `free` (`available: false`), `basic`, `standard`, `pro`. The legacy `g1` plan has `default`. Each bundle carries `price` (toman/h),
  `displayPrice` (toman/month) and its limits (see `plans.md` for the table).
- **❌** The CLI labels bundles **by position** `[0]`/`[1]`/`[2]` as Free/Standard/Pro (`commands/plan/list.ts:37-39`). The live
  order is `free, basic, standard, pro`, so the CLI shows basic's price as "Standard" and standard's as "Pro". **Miara keys by
  bundlePlanID, never by position.**
- **✅** Bundle IDs: `free`, `basic`, `standard`, `pro` (`utils/set-bundle-plan-names.ts`). `enterprise` (`errors/bundle-plan.ts:36`)
  does not appear in the catalog. The console mapping (پایه = basic, نقره‌ای = standard, طلایی = pro) is confirmed by price: see `plans.md`.
- **✅** The app's current plan and bundle are `planID` and `bundlePlanID` on `GET v1/projects/{app}` (and on each item of `v1/projects`).
  The test app is `small-g2` + `basic`. Details also give `hourlyPrice` 659.72 and `bundleHourlyPrice` 381.94, which equal
  the catalog's `small-g2` price and `small-g2.basic.price` (`v1-project.json`).
- ⏸ Create app: `POST v1/projects/` with `{ name, planID, platform, bundlePlanID, network, readOnlyRootFilesystem }`
  (`commands/app/create.ts:80-88`). `planID === 'free'` requires `bundlePlanID === 'free'` (`:76`).
  The spec (`pass_apps_create-a-app.md`) omits `bundlePlanID`.
- ⏸ Change plan: `POST v1/projects/{name}/resize` with `{ planID }` (spec `pass_apps_change-plan.md`).

## 4. Build status and logs
source: CLI (build) · spec and CLI (runtime logs) · status: **✅ read paths verified**; polling during a live build is ⏸

1. ⏸ **Queue**: poll `GET v1/releases/{releaseID}` every 3 s while `release.queue > 0` (`commands/deploy.ts:485-506`).
   **✅** The endpoint works on a finished release: `{ release: { _id, type, projectType, state: "READY", disks, platformConfig, createdAt }, platformConfig }`
   (`v1-release.json`). `queue` is absent once a release is done.
2. **✅ Build logs and status**: `GET v2/releases/{releaseID}/build-logs` (`services/build-logs.ts:26`) returned
   `{ release: { _id, state: "READY" }, buildOutput: [{ _id, line, stream: "STDOUT", releaseID, createdAt, __v }] }`
   (`v2-release-build-logs.json`). This matches `types/build-logs-response.ts`. On a finished release, `status` and `failReason` are absent.
   The call without `since` returns the full log, as the CLI's first poll does.
   - Any line with `stream !== 'STDOUT'` means the build failed (`:30-46`). ⏸ (no failed build observed).
   - The line prefixes `Successfully tagged` and `Pushing...` mark the push phase.
   - With no new lines, the terminal states are `CANCELED`, `TIMEDOUT`, `FAILED` (with `failReason`), `UNHEALTHY` and `READY`.
     `DEPLOYING` is a transitional state (`:50-82`). **✅** `READY` was observed; the others are ⏸.
3. ⏸ **Image deploys** poll `GET v1/releases/{releaseID}` state only (`commands/deploy.ts:681-719`).
4. `--detach` skips polling entirely (`commands/deploy.ts:225-229`).
5. **✅ Release history**: `GET v1/projects/{name}/releases?page=1&count=10` returned
   `{ total, currentRelease, readyReleasesCount, releases: [{ _id, type, imageName, projectType, state, port, buildArgs, buildLocation, buildTimeout, client, disks, finishedAt, platformConfig, createdAt, tag, sourceAvailable }], platform }`,
   newest first (`v1-project-releases.json`; spec `pass_apps_get-releases-of-app.md`).
6. **Runtime app logs: settled. v2 is primary, v1 is the fallback.**
   - **✅ v2 (primary)**: `GET v2/projects/{app}/logs?start=<unix s>&direction=forward&last_lines=false` (`commands/app/logs.ts:227-238`)
     returned `{ data: [{ metaData: { releaseId }, values: [[<unix ns string>, <JSON string {type, _entry}>]] }] }`
     (`v2-project-logs.json`). That was 3 groups with 14 lines in total, across 2 releases, including the app's real stdout/stderr
     (`listening on 3000`, `[error] boom …`). Each value's second element must be `JSON.parse`d, then all values flattened and sorted by
     the nanosecond timestamp (`:245-247`). The groups are **not** in time order.
   - **✅ v1 (fallback)**: `GET v1/projects/{name}/logs?since=<unix seconds>` returns `[{ type, datetime, message }]`
     (`v1-project-logs.json`, spec `pass_apps_get-logs-of-app.md`). **`since` must be unix seconds**: an ISO string is a
     **400** `"The \`since\` parameter must be a number."` (`v1-project-logs-iso.json`).
     **Caution**: its only line was `Please upgrade your client using: \`npm install -g @liara/cli\``, timestamped at request time.
     That is a deprecation notice, not an app log. Treat v1 as a last resort, and filter that line out before it reaches an evidence pack.
   - **✅** Log retention per bundle (`maxLogsRetention`, days): free 0.05 (≈1 h), basic 7, standard 30, pro 60. The CLI's free = 1 h and
     standard = 30 d (`errors/bundle-plan.ts:50-60`) agree.

## 5. Other responses captured (no CLI finding; for the client and the evidence pack)
- **Events** `GET v1/projects/{app}/events` → `{ data: [{ id, status, action, time, release, tag }] }`. `time` is unix seconds **as a string**;
  `status`/`action` are container events (`create`, `start`, `kill`, `stop`, `die`); newest first (`v1-project-events.json`).
- **Metrics summary** `GET v1/projects/{app}/metrics/summary` → `{ cpuUsage: [{ value: [unix, "<cores>"], applet }], memoryUsage: [{ value: [unix, "<bytes>"], applet }], disksUsage: [] }`.
- **CPU / memory series** `GET v1/projects/{app}/metrics/{cpu,memory}?since=<unix s>` → `{ end, result: [{ values: [[unix, "<value>"]], applet }] }`.
  Each container (`applet`) is a separate series, one point every 30 s. After a redeploy the old applet's series ends and a new one starts. Values are strings.
  (The fixtures cap each array at 50 items; `truncated` in the fixture records the original length, e.g. 101.)
- **Billing** `GET v1/billing` → `{ user: { balance, accountType, minCreditAmount, isManualMinCredit }, team?: { … same } }`.
