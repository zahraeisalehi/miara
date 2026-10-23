import { describe, expect, it } from 'vitest';

import { fixtureRoutes, TEST_TOKEN, testClient } from '../../test/helpers/liara-mock.js';

import { LiaraError } from './errors.js';

const APP = 'miara-something';

describe('Liara client reads (recorded fixtures)', () => {
  const { client } = testClient(fixtureRoutes());

  it('parses every read endpoint', async () => {
    expect((await client.getMe()).plans.projects['small-g2']).toBeDefined();
    expect((await client.listApps()).projects.map((p) => p.project_id)).toContain(APP);
    expect((await client.getApp(APP)).project.bundlePlanID).toBe('basic');
    expect((await client.listNetworks()).networks).toHaveLength(2);
    expect((await client.getLogsV2(APP, 1)).data.length).toBeGreaterThan(0);
    expect(await client.getLogsV1(APP, 1)).toHaveLength(1);
    expect((await client.getEvents(APP)).data[0]?.status).toBe('die');
    expect((await client.listReleases(APP)).total).toBe(2);
    expect((await client.getRelease('6ada4a5f7ebf55567c84fb56')).release.state).toBe('READY');
    expect(
      (await client.getBuildLogs('6ada4a5f7ebf55567c84fb56')).buildOutput.length,
    ).toBeGreaterThan(0);
    expect((await client.getMetricsSummary(APP)).cpuUsage).toHaveLength(1);
    expect((await client.getMetrics(APP, 'memory', 1)).result.length).toBeGreaterThan(0);
  });
});

describe('team mode', () => {
  it('sends teamID on every call when set', async () => {
    const { client, calls } = testClient(fixtureRoutes(), { teamId: 'team-123' });
    await client.listApps();
    await client.restartApp(APP).catch(() => {});
    expect(calls.map((c) => c.query.teamID)).toEqual(['team-123', 'team-123']);
  });

  it('omits teamID when not set', async () => {
    const { client, calls } = testClient(fixtureRoutes());
    await client.listApps();
    expect(calls[0]?.query).not.toHaveProperty('teamID');
  });

  it('getBalance uses the team balance in team mode, else the user balance', async () => {
    const team = testClient(fixtureRoutes(), { teamId: 'team-123' }).client;
    const personal = testClient(fixtureRoutes()).client;
    expect(await team.getBalance()).toEqual({
      scope: 'team',
      balance: 1994576.5,
      minCreditAmount: 20000,
    });
    expect(await personal.getBalance()).toEqual({
      scope: 'user',
      balance: 0,
      minCreditAmount: 20000,
    });
  });
});

describe('retries and errors', () => {
  it('retries a GET on 429 and 503 (honouring Retry-After), then succeeds', async () => {
    const { client, calls } = testClient({
      'GET /v1/projects': [
        { status: 429, body: {}, headers: { 'retry-after': '1' } },
        { status: 503, body: {} },
        { status: 200, body: { projects: [] } },
      ],
    });
    expect((await client.listApps()).projects).toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it('gives up after 3 GET attempts with a typed error', async () => {
    const { client, calls } = testClient({ 'GET /v1/projects': { status: 502, body: {} } });
    const err = await client.listApps().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LiaraError);
    expect(err).toMatchObject({
      kind: 'server',
      status: 502,
      endpoint: 'GET /v1/projects',
      retryable: true,
    });
    expect(calls).toHaveLength(3);
  });

  it('never retries a POST', async () => {
    const { client, calls } = testClient({
      [`POST /v1/projects/${APP}/actions/restart`]: { status: 503, body: {} },
    });
    await expect(client.restartApp(APP)).rejects.toMatchObject({ kind: 'server' });
    expect(calls).toHaveLength(1);
  });

  it('a GET timeout is `timeout`; a write timeout or network error is `unknown_outcome`', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const get = testClient({ 'GET /v1/projects': timeout }).client;
    await expect(get.listApps()).rejects.toMatchObject({ kind: 'timeout', status: 0 });

    const post = testClient({ [`POST /v1/projects/${APP}/actions/restart`]: timeout }).client;
    await expect(post.restartApp(APP)).rejects.toMatchObject({ kind: 'unknown_outcome' });

    const net = testClient({
      [`POST /v1/projects/${APP}/resize`]: new TypeError('fetch failed'),
    }).client;
    await expect(net.resizeApp(APP, 'medium-g2')).rejects.toMatchObject({
      kind: 'unknown_outcome',
    });
  });

  it('maps statuses to kinds with Persian + English messages and keeps Liara’s message', async () => {
    const { client } = testClient({
      [`GET /v1/projects/${APP}/logs`]: {
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: 'The `since` parameter must be a number.',
        },
      },
      'GET /v1/projects/nope': { status: 404, body: {} },
    });
    const bad = (await client.getLogsV1(APP, 1).catch((e: unknown) => e)) as LiaraError;
    expect(bad.kind).toBe('bad_request');
    expect(bad.messageEn).toContain('must be a number');
    expect(bad.endpoint).toBe('GET /v1/projects/{app}/logs');
    const missing = (await client.getApp('nope').catch((e: unknown) => e)) as LiaraError;
    expect(missing.kind).toBe('not_found');
    expect(missing.messageFa).toContain('LIARA_TEAM_ID');
  });

  it('a 200 that fails the schema is `invalid_response` naming the issue paths, never the values', async () => {
    const { client } = testClient({
      [`GET /v1/projects/${APP}/releases`]: {
        status: 200,
        body: { releases: [{ _id: 'r1', state: 7, createdAt: null, secretish: 'VALUE-XYZ' }] },
      },
    });
    const err = (await client.listReleases(APP).catch((e: unknown) => e)) as LiaraError;
    expect(err.kind).toBe('invalid_response');
    expect(err.message).toContain('releases.0.state (expected string, received number)');
    expect(err.message).toContain('releases.0.createdAt (expected string, received null)');
    expect(err.raw).toMatchObject({
      issues: [
        { path: 'releases.0.state', code: 'invalid_type' },
        { path: 'releases.0.createdAt', code: 'invalid_type' },
      ],
    });
    expect(JSON.stringify(err.raw) + err.message).not.toContain('VALUE-XYZ');
    expect(JSON.stringify(err.raw) + err.message).not.toContain('r1');
  });

  it('redacts the token out of error bodies', async () => {
    const { client } = testClient({
      'GET /v1/projects': { status: 401, body: { message: `bad token ${TEST_TOKEN}` } },
    });
    const err = (await client.listApps().catch((e: unknown) => e)) as LiaraError;
    expect(JSON.stringify(err.raw) + err.message).not.toContain(TEST_TOKEN);
  });

  it('sends the bearer token and JSON content type on writes', async () => {
    const { client, calls } = testClient({
      ...fixtureRoutes(),
      [`POST /v1/projects/${APP}/resize`]: { status: 200, body: {} },
    });
    await client.listApps();
    await client.resizeApp(APP, 'medium-g2');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(calls[1]?.headers['content-type']).toBe('application/json');
  });
});

describe('writes send exactly what the spec/CLI documents (mocks only)', () => {
  const ack = { status: 200, body: { message: 'ok' } };

  it('restart, scale, update-envs, resize, create', async () => {
    const { client, calls } = testClient({
      [`POST /v1/projects/${APP}/actions/restart`]: ack,
      [`POST /v1/projects/${APP}/actions/scale`]: ack,
      'POST /v1/projects/update-envs': ack,
      [`POST /v1/projects/${APP}/resize`]: ack,
      'POST /v1/projects/': ack,
    });
    await client.restartApp(APP);
    await client.scaleApp(APP, 0);
    await client.updateEnvs(APP, [{ key: 'A', value: 'b' }]);
    await client.resizeApp(APP, 'medium-g2');
    await client.createApp({
      name: 'new-app',
      planID: 'small-g2',
      platform: 'node',
      bundlePlanID: 'standard',
      networkId: 'net-id',
    });
    expect(calls.map((c) => [c.method, c.path, c.json])).toEqual([
      ['POST', `/v1/projects/${APP}/actions/restart`, undefined],
      ['POST', `/v1/projects/${APP}/actions/scale`, { scale: 0 }],
      ['POST', '/v1/projects/update-envs', { project: APP, variables: [{ key: 'A', value: 'b' }] }],
      ['POST', `/v1/projects/${APP}/resize`, { planID: 'medium-g2' }],
      [
        'POST',
        '/v1/projects/',
        {
          name: 'new-app',
          planID: 'small-g2',
          platform: 'node',
          bundlePlanID: 'standard',
          network: 'net-id',
        },
      ],
    ]);
  });

  it('upload is multipart `file`; release body carries sourceID', async () => {
    const { client, calls } = testClient({
      [`POST /v2/projects/${APP}/sources`]: { status: 200, body: { sourceID: 'src-1' } },
      [`POST /v2/projects/${APP}/releases`]: { status: 200, body: { releaseID: 'rel-1' } },
    });
    const { sourceID } = await client.uploadSource(APP, new Uint8Array([0x1f, 0x8b, 0]));
    const { releaseID } = await client.createRelease(APP, {
      build: { location: 'iran' },
      port: 3000,
      type: 'node',
      sourceID,
    });
    expect(releaseID).toBe('rel-1');
    expect(calls[0]?.form?.get('file')).toBeInstanceOf(Blob);
    expect(calls[1]?.json).toEqual({
      build: { location: 'iran' },
      port: 3000,
      type: 'node',
      sourceID: 'src-1',
    });
  });
});
