# @miara/mcp — MCP server for coding agents (stdio; Streamable HTTP later)

- Thin wrapper: every registry tool is registered with the same policy gate (`gate.propose`). No Liara calls or business logic here.
- SDK v2 `@modelcontextprotocol/server@2.3.1` (read from node_modules): `McpServer.registerTool(name, { inputSchema: fromJsonSchema(registryJsonSchema) }, cb)`;
  `serveStdio(factory)` picks the protocol era per connection (`initialize` = 2025 era, what Claude Code speaks today).
- Approvals (D20): tier ≥ 2 returns `inputRequired({ inputRequests: { approval: inputRequired.elicit(...) }, requestState })`.
  The state is minted by `createRequestStateCodec` (HMAC, 10 min, bound to the method) and verified in `ServerOptions.requestState.verify`;
  the handler reads it with `ctx.mcpReq.requestState()` and the answer with `acceptedContent(ctx.mcpReq.inputResponses, 'approval')`.
  On 2025-era connections the SDK's legacy shim turns this into a real `elicitation/create` request.
  Client capabilities: the request envelope (`CLIENT_CAPABILITIES_META_KEY`) on the 2026 era, `server.getClientCapabilities()` on 2025.
- No elicitation, or declined → `pending_approval` text + `pnpm miara approve <id>` (TTY-only, approves only) + `run_approved`.
- Never write to stdout (protocol channel); log to stderr. Never return secrets. Errors are fa/en text, never stack traces.
- Tests: `test/harness.ts` (core's `@miara/core/testing` + in-memory transport, `era: 'legacy' | 'modern'`), `test/stdio.test.ts` spawns the real entry.

Commands: `pnpm --filter @miara/mcp typecheck` · `pnpm test` · `pnpm --filter @miara/mcp inspect` · `pnpm miara approvals|approve <id>`
