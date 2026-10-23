// DB tests run against the local compose Postgres (host port 5433), in a separate `miara_test` database.
// When the container is down they skip with a message instead of failing.
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

import { createDb, migrateDb } from '../../src/db/client.js';
import type { Db } from '../../src/db/client.js';

const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://miara:miara@localhost:5433/miara';
const TEST_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://miara:miara@localhost:5433/miara_test';

export const DB_DOWN_MESSAGE =
  'Postgres on localhost:5433 is down: run "docker compose -p miara up -d db". DB tests skipped.';

async function prepare(): Promise<boolean> {
  const admin = postgres(ADMIN_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    const [row] = await admin`select 1 as ok from pg_database where datname = 'miara_test'`;
    if (!row) await admin.unsafe('create database miara_test');
    return true;
  } catch {
    return false;
  } finally {
    await admin.end({ timeout: 1 }).catch(() => {});
  }
}

/** Resolved once per test file at import time (top-level await), so `describe.skipIf` can use it. */
export const dbAvailable: boolean = await prepare();
if (!dbAvailable) process.stderr.write(`\n⚠ ${DB_DOWN_MESSAGE}\n`);

let shared: { db: Db; close: () => Promise<void> } | undefined;

export async function testDb(): Promise<Db> {
  if (!shared) {
    shared = createDb(TEST_URL);
    await migrateDb(shared.db);
  }
  return shared.db;
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(
    sql`truncate table approvals, timeline_events, incidents, metric_snapshots restart identity`,
  );
}

export async function closeTestDb(): Promise<void> {
  await shared?.close();
  shared = undefined;
}
