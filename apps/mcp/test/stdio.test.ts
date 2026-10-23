// The real entry point over real stdio: every stdout line must be JSON-RPC; logs go to stderr.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

it('keeps stdout clean: initialize + tools/list answer as JSON-RPC, logs on stderr', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'miara-mcp-'));
  const envFile = join(dir, 'env');
  writeFileSync(
    envFile,
    'LIARA_API_TOKEN=dummy-token-for-test\nBOXAPI_API_KEY=dummy-key\nBOXAPI_MODEL=test-model\nDATABASE_URL=postgres://x:y@127.0.0.1:1/none\n',
  );
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/mcp/src/stdio.ts'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '', MIARA_ENV_FILE: envFile },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

  const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`);
  const waitFor = async (pred: () => boolean, ms = 20_000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > ms) throw new Error(`timeout; stderr: ${stderr}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'stdio-test', version: '0' },
    },
  });
  await waitFor(() => stdout.includes('"id":1'));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  await waitFor(() => stdout.includes('"id":2'));
  child.stdin.end();
  await new Promise((r) => child.once('exit', r));

  const lines = stdout.split('\n').filter((l) => l.trim());
  expect(lines.length).toBeGreaterThanOrEqual(2);
  for (const line of lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' });
  const list = lines.map((l) => JSON.parse(l) as { id?: number; result?: { tools?: unknown[] } });
  expect(list.find((m) => m.id === 2)?.result?.tools?.length).toBeGreaterThan(15);
  expect(stderr).toMatch(/\[miara-mcp\] ready/);
  expect(stdout + stderr).not.toContain('dummy-token-for-test');
}, 30_000);
