# Liara app creation flow (from the Liara console, captured 2026-10)

The console wizard has 5 steps. Miara's deploy workflow must cover the same inputs.

1. **Platform**: nodejs, nextjs, laravel, php, python, django, flask, docker, go, static, vue, angular, react, dotnet.
   The Node platform also covers Express, Nuxt, Adonis, Nest, and others. API platform string values: see the PaaS pages in `docs/vendor/liara/pages/`.
2. **App ID**: unique, becomes `https://<id>.liara.run`. **That address is active for only 7 days from the first deploy**
   and is meant for initial testing. A custom domain/subdomain is attached afterwards.
3. **Private network** (required): pick an existing one or create one (name must be unique; examples: backend-net, staging).
   Apps and DBs in the same network can talk privately. Check the PaaS pages in `docs/vendor/liara/pages/` for network endpoints. If none exist, list
   this in `capabilities.md` and tell the user to create one in the console.
4. **Resources**: plan (Earth…Pluto) + feature bundle (base / silver / gold). See `plans.md`.
5. **Review & create**: shows plan cost + bundle cost + 10% VAT. Billing is **hourly from account credit**.
   Create is tier 3 (it spends money).

## Deploy methods
- Console: zip upload.
- CLI: `liara deploy` reads `liara.json` (fields: app, port, platform, node{version,mirror,timezone}, disks, team-id).
- GitHub: connect the account and repo in the console; auto-deploy on push, or deploy only when CI passes. In `liara.json` for the
  GitHub method, do **not** set `app` and `platform` (Liara detects them, and setting them causes errors).
- API (what Miara uses): upload source archive → create release. Confirm the bodies in the PaaS pages in `docs/vendor/liara/pages/` and the CLI source.

## Useful CLI facts (from the CLI README; the API equivalents are in the CLI source)
- `liara app create --app --platform --plan --feature-plan --network --read-only` (`--feature-plan` = bundle).
- `liara deploy --path --platform --app --port --image --detach --message --disks --no-cache --dockerfile
  --build-arg --build-location iran|germany --liara-json`.
- **Build location `germany`** is the fix when the build can't download packages from outside Iran. Diagnosis should
  suggest it when build logs show npm/pip/registry timeouts.
- `liara update-port`, `liara env set|unset`, `liara network create|list`, `liara plan list`, `liara logs`, `liara init`
  (which generates liara.json).

## Ignore rules
`.liaraignore` or `.gitignore` decide what is uploaded. Never upload node_modules, `.env*`, or build caches.
