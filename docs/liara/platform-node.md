# Node.js platform on Liara (condensed from docs.liara.ir)

Build/run sequence:
1. `npm install` (installs dependencies **and** devDependencies). Everything must be listed in package.json.
2. `npm run build` if a `build` script exists.
3. `npm run start`. **A `start` script is mandatory.**

`liara.json` for CLI/API deploys:
```json
{ "app": "my-app", "port": 3000, "platform": "node",
  "node": { "version": "22", "mirror": true, "timezone": "Asia/Tehran" },
  "disks": [{ "name": "database", "mountTo": "db" }] }
```
- `port` must equal the port the app listens on. A mismatch is the #1 deploy failure. Detect it from code/env and confirm.
- `node.mirror`: Liara's npm mirror is on by default. Set it to `false` if a new package fails to install.
- Default timezone is Asia/Tehran.
- TypeScript: `build: "tsc"`, `start: "node dist/server.js"`. The docs suggest deleting package-lock.json if install fails.

Hooks (project root):
| File | When | Env vars available | Use |
|---|---|---|---|
| `liara_pre_build.sh` | before build | no | apt-get system packages |
| `liara_post_build.sh` | after build | no | cache/optimization |
| `liara_pre_start.sh` | before start | yes | DB migrations |

Runtime facts:
- Env vars are read with `process.env` and set through the API (update envs). Changing them restarts the app.
- App logs = stdout/stderr (`console.log`), which are available through the logs endpoint.
- Liara sits behind a reverse proxy, so the app needs trust-proxy for real client IPs (X-Forwarded-For).
- WebSocket works; the client must use `wss://`.
- Disks: create a disk, then mount it through `liara.json` `disks` (relative paths). The container filesystem is otherwise ephemeral.
- DB connection: put the DB URI in an env var (e.g. `PG_URI=postgresql://...@<host>:5432/...`). Inside the private network
  the host is the DB's internal name.
- FFMPEG is preinstalled (FFMPEG_PATH, FFPROBE_PATH).
