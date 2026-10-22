# Liara API findings from the vendored sources (pre-Spike B)

Read from the CLI source at commit `14ec35f79d703a09a5e3abbb22ba59239cdde80d` (2026-10-18; fetch it with
`scripts/vendor-liara-cli.sh`) and from the spec pages. CLI paths are relative to `docs/vendor/liara-cli/src/`, spec
pages to `docs/vendor/liara/pages/`. All hosts are `https://api.liara.ir` (`constants.ts:10-13`).

**Everything here is unverified until Spike B (Phase 1) hits the live API and records fixtures.** Update each
`status` line when that happens.

## 1. Networks
source: CLI only (not in the spec pages) · status: unverified (Spike B)

| Call | Request | Response | Cite |
|---|---|---|---|
| List | `GET v1/networks` | `{ networks: [{ _id, name, createdAt }] }` | `commands/network/list.ts:22-24`, `types/get-network-response.ts`, `types/network.ts` |
| Create | `POST v1/networks` JSON `{ networkName }` | body unused by the CLI; **409** = name already exists | `commands/network/create.ts:28`, `:36` |

- App create sends the network's **`_id`**, not its name: `network: network?._id` (`commands/app/create.ts:86`).
- The CLI looks a network up by name client-side, from the list (`base.ts:462-498`).

## 2. Source upload + release
source: both (the spec is a subset of the CLI) · status: unverified (Spike B)

**Archive** (`utils/create-archive.ts`)
- A tar.gz with gzip `level: 9`, built from the project root (`:165-174`).
- Ignore rules: the default list (`.git`, `node_modules`, `.next`, `liara.json`, …, `:10-21`), plus per-platform lists
  (`:23-70`), plus the first of these found in each directory: `.liaraignore`, then `.dockerignore`, then `.gitignore` (`:116-125`).
- It errors if everything is ignored (`:160`).
- Size: the client refuses sources over 256 MiB (`constants.ts:29`, `commands/deploy.ts:456-465`). The server returns
  **413** on a per-bundle limit (`commands/deploy.ts:387`): free = 128MB, standard = 256MB (`errors/bundle-plan.ts:13-21`).

**Upload**: `POST v2/projects/{app}/sources`, `multipart/form-data` with the field `file` set to the .gz.
It returns `{ sourceID }`. Cite: `services/upload.ts:6-8`, `commands/deploy.ts:877-883`, spec `pass_deploy_deploy-sources-code.md`.

**Create release**: `POST v2/projects/{app}/releases` with JSON, returning `{ releaseID }` (`commands/deploy.ts:479-483`, `types/created-release.ts`).
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
- The free bundle can't use the Germany builder (`errors/bundle-plan.ts:43-48`).
- The free bundle allows 10 deploys a day and standard allows 50 (`errors/bundle-plan.ts:2-11`).

**Cancel**: `POST v2/releases/{releaseID}/cancel`, retried 3 times (`services/cancel-deployment.ts:13`, `commands/deploy.ts:520-527`).

## 3. Plans and feature-plan (bundle) IDs
source: CLI, plus the spec (shape untyped) · status: unverified (Spike B)

- There is no plan endpoint. The CLI reads `GET v1/me` and uses `plans` from it (`commands/plan/list.ts:21`).
  The spec page `account_user_get-current-user-and-console-information.md` types `plans.projects` and
  `plans.projectBundlePlans` only as `additionalProperties: true`.
- `plans.projects`: keys are **planID**s. The CLI shows only `free` or keys containing `g2`, with `available === true`
  and `region === 'iran'`. Fields: `RAM.amount` (GB), `CPU.amount` (cores), `volume` (GB disk), and `price`
  (hourly; monthly = `price * 720` toman) (`commands/plan/list.ts:22-46`).
- `plans.projectBundlePlans[planID]`: keys are **bundlePlanID**s, each with `displayPrice` (monthly toman). The CLI
  assumes the order free/standard/pro (`commands/plan/list.ts:31-39`).
- Known bundle IDs: `free`, `basic`, `standard`, `pro` (`utils/set-bundle-plan-names.ts`), plus `enterprise`
  (`errors/bundle-plan.ts:36`). The console mapping is in `docs/liara/plans.md`.
- The app's current bundle is `bundlePlanID` on `GET v1/projects/{app}` (`commands/deploy.ts:200`).
- Create app: `POST v1/projects/` with `{ name, planID, platform, bundlePlanID, network, readOnlyRootFilesystem }`
  (`commands/app/create.ts:80-88`). `planID === 'free'` requires `bundlePlanID === 'free'` (`:76`).
  The spec (`pass_apps_create-a-app.md`) omits `bundlePlanID`.
- Change plan: `POST v1/projects/{name}/resize` with `{ planID }` (spec `pass_apps_change-plan.md`).

## 4. Build status and logs
source: CLI (build) · spec and CLI disagree (runtime logs) · status: unverified (Spike B)

1. **Queue**: poll `GET v1/releases/{releaseID}` every 3 s while `release.queue > 0` (`commands/deploy.ts:485-506`).
2. **Build logs and status**: poll `GET v2/releases/{releaseID}/build-logs?since=<createdAt of last line>`
   (`services/build-logs.ts:26`). The response (`types/build-logs-response.ts`, `types/release.ts`, `types/build-output.ts`):
   `{ release: { state, status, failReason?, queue? }, buildOutput: [{ _id, line, stream, releaseID, createdAt }] }`.
   - Any line with `stream !== 'STDOUT'` means the build failed (`:30-46`).
   - The line prefixes `Successfully tagged` and `Pushing...` mark the push phase.
   - With no new lines, the terminal states are `CANCELED`, `TIMEDOUT`, `FAILED` (with `failReason`), `UNHEALTHY` and `READY`.
     `DEPLOYING` is a transitional state (`:50-82`).
3. **Image deploys** poll `GET v1/releases/{releaseID}` state only (`commands/deploy.ts:681-719`).
4. `--detach` skips polling entirely (`commands/deploy.ts:225-229`).
5. **Release history**: `GET v1/projects/{name}/releases?page=&count=` returns `{ total, currentRelease, releases[{ _id, state, … }] }`
   (spec `pass_apps_get-releases-of-app.md`).
6. **Runtime app logs** (the CLI and the spec disagree; Spike B decides):
   - CLI: `GET v2/projects/{app}/logs?start=<unix>&direction=forward&last_lines=<bool>&releaseId=<id?>`
     (`commands/app/logs.ts:227-238`). Lines arrive in groups and must be flattened and sorted by timestamp (`:245-247`).
   - Spec: `GET v1/projects/{name}/logs?since=<timestamp>` returns `[{ type, datetime, message }]` (`pass_apps_get-logs-of-app.md`).
   - Log retention depends on the bundle: free = 1 h, standard = 30 days (`errors/bundle-plan.ts:50-60`).
