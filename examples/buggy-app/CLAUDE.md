# @miara/buggy-app — demo Node app Miara deploys and diagnoses

- A plain `node:http` server with no framework, so a deploy to the Liara `node` platform stays simple.
- Phase 3/5 adds switchable faults (memory leak, crash loop, 5xx, slow responses), toggled by env var for the demo (docs/DEMO.md).
- `/health` must stay cheap and reliable; Miara's HTTP probe uses it.
- It must not depend on any `@miara/*` package.

Commands: `pnpm --filter @miara/buggy-app typecheck` · `pnpm test`
