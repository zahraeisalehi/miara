import { resolve } from 'node:path';

import { sql as rawSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema.js';

export const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../drizzle');

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/**
 * Resolves if the database answers and is migrated; rejects with the driver error otherwise (classify it with
 * dbProblemMessage). A timeout rejects with code CONNECT_TIMEOUT.
 */
export async function pingDb(db: Db, timeoutMs = 3000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(Object.assign(new Error('database ping timed out'), { code: 'CONNECT_TIMEOUT' })),
      timeoutMs,
    );
  });
  try {
    await Promise.race([db.execute(rawSql`select 1 from approvals limit 1`), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
