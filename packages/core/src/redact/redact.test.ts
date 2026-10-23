import { describe, expect, it } from 'vitest';

import {
  REDACTED,
  REDACTED_ENV,
  REDACTED_PII,
  assertClean,
  buildSecretSet,
  redactDeep,
  redactString,
} from './index.js';

const TOKEN = 'liara-token-value-1234567890';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

describe('buildSecretSet', () => {
  it('keeps long values, skips non-secret keys and short values', () => {
    const secrets = buildSecretSet({
      LIARA_API_TOKEN: TOKEN,
      BOXAPI_MODEL: 'gpt-5.4-mini-long-name',
      WEB_PORT: '3100',
      SHORT: 'abc',
      EMPTY: undefined,
    });
    expect(secrets).toEqual([TOKEN]);
  });

  it('orders longest first', () => {
    expect(buildSecretSet({ A: 'abcdefgh', B: 'abcdefghijkl' })).toEqual([
      'abcdefghijkl',
      'abcdefgh',
    ]);
  });
});

describe('redactString', () => {
  it('replaces env values, JWTs, bearer credentials, emails and IPs', () => {
    const out = redactString(
      `token=${TOKEN} jwt=${JWT} Authorization: Bearer abc.def user@example.com from 10.1.2.3`,
      [TOKEN],
    );
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(JWT);
    expect(out).not.toContain('abc.def');
    expect(out).not.toContain('user@example.com');
    expect(out).not.toContain('10.1.2.3');
    expect(out).toContain(REDACTED_ENV);
  });

  it('leaves npm specifiers alone', () => {
    expect(redactString('installed express@4.18.2', [])).toBe('installed express@4.18.2');
  });
});

describe('redactDeep', () => {
  it('redacts credential keys and PII keys, keeps other fields', () => {
    const out = redactDeep(
      {
        apiToken: 'x',
        user: { email: 'a@b.co', phone: '0912', fullname: 'X Y', accountType: 'personal' },
      },
      [],
    );
    expect(out).toEqual({
      apiToken: REDACTED,
      user: {
        email: REDACTED_PII,
        phone: REDACTED_PII,
        fullname: REDACTED_PII,
        accountType: 'personal',
      },
    });
  });

  it('redacts credential-like token keys but keeps LLM token counts', () => {
    const out = redactDeep(
      {
        token: 't',
        apiToken: 't',
        access_token: 't',
        refreshToken: 't',
        usage: {
          prompt_tokens: 18,
          completion_tokens: 22,
          total_tokens: 40,
          completion_tokens_details: { reasoning_tokens: 4 },
          max_tokens: 100,
        },
      },
      [],
    );
    expect(out).toEqual({
      token: REDACTED,
      apiToken: REDACTED,
      access_token: REDACTED,
      refreshToken: REDACTED,
      usage: {
        prompt_tokens: 18,
        completion_tokens: 22,
        total_tokens: 40,
        completion_tokens_details: { reasoning_tokens: 4 },
        max_tokens: 100,
      },
    });
  });

  it('redacts nested env values but keeps env keys', () => {
    const out = redactDeep(
      { project: { envs: [{ key: 'DATABASE_URL', value: 'postgres://u:p@h/db' }] } },
      [],
    );
    expect(out).toEqual({ project: { envs: [{ key: 'DATABASE_URL', value: REDACTED }] } });
  });

  it('scrubs secrets inside arbitrary strings, e.g. log lines', () => {
    const out = redactDeep({ data: [{ message: `connecting with ${TOKEN}` }] }, [TOKEN]);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
});

describe('assertClean', () => {
  it('passes redacted output', () => {
    const out = JSON.stringify(redactDeep({ m: `Bearer ${TOKEN} ${JWT}` }, [TOKEN]));
    expect(() => assertClean(out, [TOKEN])).not.toThrow();
  });

  it('throws on a surviving secret, JWT or bearer credential', () => {
    expect(() => assertClean(`x ${TOKEN}`, [TOKEN])).toThrow(/env value/);
    expect(() => assertClean(JWT, [])).toThrow(/JWT/);
    expect(() => assertClean('Bearer abc', [])).toThrow(/bearer/);
  });
});
