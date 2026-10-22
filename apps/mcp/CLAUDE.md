# @miara/mcp — MCP server for coding agents (stdio first, Streamable HTTP later)

- A thin wrapper: every tool is a `@miara/core` tool with the same policy gate. No Liara calls or business logic here.
- zod-validate every MCP input.
- Tier ≥ 2 tools return `pending_approval` with a web link (use MCP elicitation when the client supports it).
- Never return secrets in tool results. Never write logs to stdout, since stdio is the protocol channel (use stderr).
- Phase 2 builds this (docs/PHASES.md).

Commands: `pnpm --filter @miara/mcp typecheck` · `pnpm test`
