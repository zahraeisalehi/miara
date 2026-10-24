// Typed Liara client. Every method cites its source (CLAUDE.md non-negotiable 3); paths: spec = docs/vendor/liara/pages/,
// CLI = docs/vendor/liara-cli/src/. Live status of each call: docs/liara/api-findings.md.
import type { z } from 'zod';

import { createLiaraHttp } from './http.js';
import type { FetchLike, LiaraHttp } from './http.js';
import {
  BillingResponse,
  BuildLogsResponse,
  CreatedReleaseResponse,
  DomainsResponse,
  EventsResponse,
  MeResponse,
  MetricSeriesResponse,
  MetricsSummaryResponse,
  NetworksResponse,
  ProjectResponse,
  ProjectsResponse,
  ReleaseResponse,
  ReleasesResponse,
  SourceUploadResponse,
  V1LogsResponse,
  V2LogsResponse,
  RestartAck,
  WriteAck,
} from './schemas.js';

export interface LiaraClientOptions {
  token: string;
  teamId?: string | undefined;
  secrets: readonly string[];
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/** Body of POST v2/projects/{app}/releases, as the CLI builds it (commands/deploy.ts:403-436, :475). */
export interface ReleaseBody {
  build: { cache?: boolean; args?: string[]; dockerfile?: string; location: 'iran' | 'germany' };
  cron?: string[];
  args?: string[];
  port: number;
  type: string;
  message?: string;
  disks?: unknown[];
  envs?: unknown[];
  gitInfo?: Record<string, unknown>;
  platformConfig?: Record<string, unknown>;
  healthCheck?: { command: string[] };
  sourceID: string;
}

export interface Balance {
  scope: 'team' | 'user';
  balance: number;
  minCreditAmount: number;
}

/** Source uploads get 5 minutes; the CLI disables the timeout entirely (services/upload.ts:10-12). */
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

const enc = encodeURIComponent;

export function createLiaraClient(opts: LiaraClientOptions) {
  const http: LiaraHttp = createLiaraHttp(opts);
  const get = <S extends z.ZodType>(
    path: string,
    template: string,
    schema: S,
    query?: Record<string, string | undefined>,
  ) => http({ method: 'GET', path, template, schema, ...(query ? { query } : {}) });
  const post = <S extends z.ZodType>(path: string, template: string, schema: S, json?: unknown) =>
    http({ method: 'POST', path, template, schema, ...(json !== undefined ? { json } : {}) });

  return {
    teamMode: Boolean(opts.teamId),

    // ---- Reads (all ✅ live in Spike B unless noted)

    /** spec account_user_get-current-user-and-console-information.md; CLI commands/plan/list.ts:21 */
    getMe: () => get('/v1/me', '/v1/me', MeResponse),

    /** spec billing_billing_get-current-user-billing-information.md */
    getBilling: () => get('/v1/billing', '/v1/billing', BillingResponse),

    /** Team balance in team mode (the team pays), else the user's. docs/liara/capabilities.md "Billing". */
    async getBalance(): Promise<Balance> {
      const billing = await get('/v1/billing', '/v1/billing', BillingResponse);
      const account = opts.teamId && billing.team ? billing.team : billing.user;
      return {
        scope: opts.teamId && billing.team ? 'team' : 'user',
        balance: account.balance,
        minCreditAmount: account.minCreditAmount,
      };
    },

    /** CLI commands/network/list.ts:22 */
    listNetworks: () => get('/v1/networks', '/v1/networks', NetworksResponse),

    /** spec pass_apps_get-details-of-all-projects.md */
    listApps: () => get('/v1/projects', '/v1/projects', ProjectsResponse),

    /** spec pass_apps_get-details-of-a-project.md */
    getApp: (app: string) => get(`/v1/projects/${enc(app)}`, '/v1/projects/{app}', ProjectResponse),

    /** Primary logs. CLI commands/app/logs.ts:227-238. Use liara/logs.ts getLogs() for flattened lines. */
    getLogsV2: (app: string, startUnix: number, releaseId?: string) =>
      get(`/v2/projects/${enc(app)}/logs`, '/v2/projects/{app}/logs', V2LogsResponse, {
        start: String(startUnix),
        direction: 'forward',
        last_lines: 'false',
        releaseId,
      }),

    /** Fallback logs; `since` must be unix seconds (ISO → 400). spec pass_apps_get-logs-of-app.md */
    getLogsV1: (app: string, sinceUnix: number) =>
      get(`/v1/projects/${enc(app)}/logs`, '/v1/projects/{app}/logs', V1LogsResponse, {
        since: String(sinceUnix),
      }),

    /** spec pass_apps_get-events-of-the-app.md */
    getEvents: (app: string) =>
      get(`/v1/projects/${enc(app)}/events`, '/v1/projects/{app}/events', EventsResponse),

    /** spec pass_apps_get-releases-of-app.md */
    listReleases: (app: string, page = 1, count = 10) =>
      get(`/v1/projects/${enc(app)}/releases`, '/v1/projects/{app}/releases', ReleasesResponse, {
        page: String(page),
        count: String(count),
      }),

    /** Queue + state. CLI commands/deploy.ts:488 */
    getRelease: (releaseId: string) =>
      get(`/v1/releases/${enc(releaseId)}`, '/v1/releases/{id}', ReleaseResponse),

    /** `since` = createdAt of the last line seen. CLI services/build-logs.ts:26 */
    getBuildLogs: (releaseId: string, since?: string) =>
      get(
        `/v2/releases/${enc(releaseId)}/build-logs`,
        '/v2/releases/{id}/build-logs',
        BuildLogsResponse,
        { since },
      ),

    /** spec pass_reports_get-summary-reports-of-app.md */
    getMetricsSummary: (app: string) =>
      get(
        `/v1/projects/${enc(app)}/metrics/summary`,
        '/v1/projects/{app}/metrics/summary',
        MetricsSummaryResponse,
      ),

    /** spec pass_reports_get-{cpu,memory}-reports-of-app.md */
    getMetrics: (app: string, kind: 'cpu' | 'memory', sinceUnix: number) =>
      get(
        `/v1/projects/${enc(app)}/metrics/${kind}`,
        `/v1/projects/{app}/metrics/${kind}`,
        MetricSeriesResponse,
        { since: String(sinceUnix) },
      ),

    /** ⏸ unverified (no fixture). spec pass_domains_get-all-domains.md; CLI commands/deploy.ts:246 */
    listDomains: (app: string) =>
      get('/v1/domains', '/v1/domains', DomainsResponse, { project: app }),

    // ---- Writes (⏸ not run live yet; tested against mocks only). Never retried (liara/http.ts).

    /** spec pass_apps_to-restart-a-app.md; CLI commands/app/restart.ts:27 */
    restartApp: (app: string) =>
      post(
        `/v1/projects/${enc(app)}/actions/restart`,
        '/v1/projects/{app}/actions/restart',
        RestartAck,
      ),

    /** 1 = on, 0 = off. spec pass_apps_turn-on-or-off-a-app.md; CLI commands/app/start.ts:27, stop.ts:27 */
    scaleApp: (app: string, scale: 0 | 1) =>
      post(`/v1/projects/${enc(app)}/actions/scale`, '/v1/projects/{app}/actions/scale', WriteAck, {
        scale,
      }),

    /**
     * Replaces the app's WHOLE env set and restarts it. Callers merge with the current envs first, like the CLI
     * (commands/env/set.ts:46-52). spec pass_settings_update-envs.md
     */
    updateEnvs: (app: string, variables: { key: string; value: string }[]) =>
      post('/v1/projects/update-envs', '/v1/projects/update-envs', WriteAck, {
        project: app,
        variables,
      }),

    /** spec pass_apps_change-plan.md */
    resizeApp: (app: string, planID: string) =>
      post(`/v1/projects/${enc(app)}/resize`, '/v1/projects/{app}/resize', WriteAck, { planID }),

    /** `network` is the network _id. CLI commands/app/create.ts:80-88; spec pass_apps_create-a-app.md */
    createApp: (input: {
      name: string;
      planID: string;
      platform: string;
      bundlePlanID: string;
      networkId: string;
      readOnlyRootFilesystem?: boolean | undefined;
    }) =>
      post('/v1/projects/', '/v1/projects/', WriteAck, {
        name: input.name,
        planID: input.planID,
        platform: input.platform,
        bundlePlanID: input.bundlePlanID,
        network: input.networkId,
        readOnlyRootFilesystem: input.readOnlyRootFilesystem,
      }),

    /** multipart field `file` = the .tar.gz. spec pass_deploy_deploy-sources-code.md; CLI services/upload.ts:6-8 */
    uploadSource(app: string, archive: Uint8Array, filename = 'source.tar.gz') {
      const form = new FormData();
      form.append('file', new Blob([archive], { type: 'application/gzip' }), filename);
      return http({
        method: 'POST',
        path: `/v2/projects/${enc(app)}/sources`,
        template: '/v2/projects/{app}/sources',
        schema: SourceUploadResponse,
        form,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
    },

    /** CLI commands/deploy.ts:475-483; spec pass_deploy_deploy-releases.md (subset) */
    createRelease: (app: string, body: ReleaseBody) =>
      post(
        `/v2/projects/${enc(app)}/releases`,
        '/v2/projects/{app}/releases',
        CreatedReleaseResponse,
        body,
      ),
  };
}

export type LiaraClient = ReturnType<typeof createLiaraClient>;
