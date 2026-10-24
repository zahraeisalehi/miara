import { describe, expect, it } from 'vitest';

import { createHttpProbe, MAX_BODY_CHARS, ProbeInputError, probeUrl } from './index.js';

const reply =
  (status: number, body = '') =>
  async () =>
    new Response(body, { status });

describe('probeUrl', () => {
  it('always targets https://<app>.liara.run', () => {
    expect(probeUrl('buggy-app', '/health').href).toBe('https://buggy-app.liara.run/health');
  });

  it('refuses inputs that could point elsewhere', () => {
    for (const path of ['health', '//evil.com/x', '/@evil.com', '/x#y', '/a b']) {
      expect(() => probeUrl('buggy-app', path)).toThrow(ProbeInputError);
    }
    for (const app of ['evil.com/', 'a.b', '', 'UPPER', 'x.']) {
      expect(() => probeUrl(app, '/')).toThrow(ProbeInputError);
    }
  });
});

describe('createHttpProbe', () => {
  it('a 200 is reachable and healthy, body capped', async () => {
    const probe = createHttpProbe({ fetch: reply(200, 'x'.repeat(1000)) });
    const r = await probe('buggy-app', '/health');
    expect(r).toMatchObject({ reachable: true, healthy: true, status: 200 });
    expect(r.body).toHaveLength(MAX_BODY_CHARS);
  });

  it('a 404 still means the app is up; a 502 does not', async () => {
    expect((await createHttpProbe({ fetch: reply(404) })('a', '/')).healthy).toBe(true);
    const bad = await createHttpProbe({ fetch: reply(502) })('a', '/');
    expect(bad).toMatchObject({ reachable: true, healthy: false, status: 502 });
  });

  it('classifies DNS, timeout and connect failures with plain fa/en text', async () => {
    const fail = (err: unknown) => createHttpProbe({ fetch: () => Promise.reject(err) })('a', '/');
    const dns = await fail(
      new TypeError('fetch failed', { cause: Object.assign(new Error(), { code: 'ENOTFOUND' }) }),
    );
    expect(dns).toMatchObject({ reachable: false, healthy: false, failure: 'dns' });
    expect(dns.messageEn).toMatch(/resolve/);
    expect((await fail(Object.assign(new Error(), { name: 'TimeoutError' }))).failure).toBe(
      'timeout',
    );
    expect(
      (
        await fail(
          new TypeError('x', { cause: Object.assign(new Error(), { code: 'ECONNREFUSED' }) }),
        )
      ).failure,
    ).toBe('connect');
  });

  it('does not follow redirects', async () => {
    let init: RequestInit | undefined;
    await createHttpProbe({
      fetch: async (_u, i) => {
        init = i;
        return new Response('', { status: 301 });
      },
    })('a', '/');
    expect(init?.redirect).toBe('manual');
  });
});
