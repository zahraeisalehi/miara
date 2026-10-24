// Entry point for coding agents (.mcp.json): `node --import tsx apps/mcp/src/stdio.ts`.
// stdout is the protocol channel: nothing but JSON-RPC may be written there. Logs go to stderr.
import { createMiaraCore, db, redact } from '@miara/core';
import type { MiaraCore } from '@miara/core';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createApprovalCodec } from './approval.js';
import { EnvError, loadCoreConfig } from './env.js';
import { createMiaraMcpServer } from './server.js';

const log = (line: string) => process.stderr.write(`[miara-mcp] ${line}\n`);

function main() {
  let loaded;
  try {
    loaded = loadCoreConfig();
  } catch (err) {
    log(err instanceof EnvError ? err.message : 'Could not load the config.');
    process.exit(1);
  }
  const { config } = loaded;
  const secrets = redact.buildSecretSet({
    LIARA_API_TOKEN: config.liaraToken,
    LIARA_TEAM_ID: config.liaraTeamId,
    BOXAPI_API_KEY: config.boxapiKey,
  });
  const core = createMiaraCore(config);
  const codec = createApprovalCodec();
  const handle = serveStdio(() => createMiaraMcpServer(core, { codec, secrets, log }), {
    onerror: (e) => log(`transport error: ${redact.redactString(e.message, secrets)}`),
  });
  const shutdown = async () => {
    await handle.close().catch(() => undefined);
    await core.close().catch(() => undefined);
    process.exit(0);
  };
  process.stdin.on('end', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  log(`ready (${core.registry.list().length} core tools + run_approved)`);
  void probeDatabase(core);
}

/** Warns on stderr at startup if Miara's own database is down; the server keeps running either way. */
async function probeDatabase(core: MiaraCore) {
  try {
    await db.pingDb(core.db);
  } catch (err) {
    const problem = db.dbProblemMessage(err);
    log(
      `database check failed at startup: ${problem?.en ?? 'unexpected error (see tool results)'}`,
    );
  }
}

main();
