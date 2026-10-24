import { describe, expect, it } from 'vitest';

import { dbProblemMessage, isDbNotMigrated, isDbUnavailable } from './errors.js';

const withCode = (code: string, message = code) => Object.assign(new Error(message), { code });

describe('isDbUnavailable', () => {
  it('matches a plain ECONNREFUSED', () => {
    expect(isDbUnavailable(withCode('ECONNREFUSED'))).toBe(true);
  });

  it('matches inside an AggregateError (localhost → ::1 and 127.0.0.1)', () => {
    const agg = new AggregateError([withCode('ECONNREFUSED'), withCode('ECONNREFUSED')], '');
    expect(isDbUnavailable(agg)).toBe(true);
  });

  it('matches through a DrizzleQueryError-shaped cause chain', () => {
    const inner = new AggregateError([withCode('ECONNREFUSED')], '');
    const wrapped = new Error('Failed query: select ...', { cause: inner });
    expect(isDbUnavailable(wrapped)).toBe(true);
  });

  it('matches postgres.js and PG startup codes', () => {
    expect(isDbUnavailable(withCode('CONNECT_TIMEOUT'))).toBe(true);
    expect(isDbUnavailable(withCode('57P03'))).toBe(true);
  });

  it('ignores unrelated errors and non-errors', () => {
    expect(isDbUnavailable(new Error('boom'))).toBe(false);
    expect(isDbUnavailable(withCode('23505'))).toBe(false);
    expect(isDbUnavailable('ECONNREFUSED')).toBe(false);
    expect(isDbUnavailable(undefined)).toBe(false);
  });

  it('does not hang on a cyclic cause', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b', { cause: a });
    a.cause = b;
    expect(isDbUnavailable(a)).toBe(false);
  });
});

describe('isDbNotMigrated / dbProblemMessage', () => {
  it('a missing table means migrations were not run', () => {
    const err = new Error('Failed query', { cause: withCode('42P01') });
    expect(isDbNotMigrated(err)).toBe(true);
    expect(isDbUnavailable(err)).toBe(false);
    expect(dbProblemMessage(err)?.en).toMatch(/pnpm db:migrate/);
  });

  it('names the compose command when the database is down', () => {
    expect(dbProblemMessage(withCode('ECONNREFUSED'))?.en).toMatch(
      /docker compose -p miara up -d db/,
    );
    expect(dbProblemMessage(new Error('boom'))).toBeUndefined();
  });
});
