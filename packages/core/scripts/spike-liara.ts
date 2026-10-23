// Spike B (docs/PHASES.md Phase 1): verify docs/liara/api-findings.md against the live API. READ-ONLY.
// Run: pnpm spike:liara <app-name>   (or LIARA_SPIKE_APP=<app-name>)
// Every request is a GET to https://api.liara.ir. Responses are redacted before they are written as fixtures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { ProjectsResponse, ReleasesResponse, V2LogsResponse } from '../src/liara/schemas.js';
import { assertClean, redactDeep, redactString } from '../src/redact/index.js';

import { REPO_ROOT, loadSpikeEnv } from './_env.js';

const LIARA_ORIGIN = 'https://api.liara.ir';
const TIMEOUT_MS = 20_000;
const MAX_ARRAY_ITEMS = 50;
const FIXTURE_DIR = resolve(REPO_ROOT, 'packages/core/test/fixtures/liara');

const { env, secrets } = loadSpikeEnv(['LIARA_API_TOKEN']);
const TOKEN = env.LIARA_API_TOKEN ?? '';
const APP = process.argv[2] ?? env.LIARA_SPIKE_APP ?? process.env.LIARA_SPIKE_APP;
// Team mode: empty means the personal account. IDs come from `liara team:list -x` (CLI commands/team/list.ts:35-39).
const TEAM_ID = env.LIARA_TEAM_ID ?? '';

interface Captured {
  name: string;
  source: string;
  path: string;
  query: Record<string, string>;
  status: number;
  durationMs: number;
  body: unknown;
  error?: string;
}

const captured: Captured[] = [];

/** The only HTTP function in this spike: GET, fixed origin, no body. */
async function liaraGet(
  path: string,
  query: Record<string, string> = {},
): Promise<{ status: number; ms: number; body: unknown; error?: string }> {
  const url = new URL(path, LIARA_ORIGIN);
  if (url.origin !== LIARA_ORIGIN) throw new Error(`Refusing non-Liara origin: ${url.origin}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  // Same as the CLI: a got beforeRequest hook sets `teamID` on every request, empty for the personal
  // account (docs/vendor/liara-cli/src/base.ts:285-293). It is kept out of the fixture `query` on purpose.
  url.searchParams.set('teamID', TEAM_ID);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      const ms = Math.round(performance.now() - started);
      if (res.status === 429 && attempt === 0) {
        const wait = Number(res.headers.get('retry-after') ?? '2') * 1000;
        console.log(`  429 on ${path}, retrying in ${wait} ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { _nonJson: text.slice(0, 2000) };
      }
      return { status: res.status, ms, body };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      return {
        status: 0,
        ms,
        body: null,
        error: redactString(err instanceof Error ? err.message : String(err), secrets),
      };
    }
  }
  return { status: 429, ms: 0, body: null, error: 'rate limited twice' };
}

/** Caps long arrays so fixtures stay small; returns the JSON-path → original length of every cut. */
function truncateArrays(value: unknown, path = '$', cuts: Record<string, number> = {}): unknown {
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) cuts[path] = value.length;
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item, i) => truncateArrays(item, `${path}[${i}]`, cuts));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, truncateArrays(v, `${path}.${k}`, cuts)]),
    );
  }
  return value;
}

function shape(value: unknown, depth = 0): string {
  if (Array.isArray(value))
    return `array(${value.length})${value.length && depth < 2 ? `<${shape(value[0], depth + 1)}>` : ''}`;
  if (value === null) return 'null';
  if (typeof value === 'object') {
    if (depth >= 2) return 'object';
    const entries = Object.entries(value);
    const shown = entries.slice(0, 12).map(([k, v]) => `${k}:${shape(v, depth + 1)}`);
    return `{${shown.join(', ')}${entries.length > 12 ? `, …+${entries.length - 12}` : ''}}`;
  }
  return typeof value;
}

async function capture(
  name: string,
  source: string,
  path: string,
  query: Record<string, string> = {},
  opts: { truncate?: boolean } = {},
): Promise<Captured> {
  const r = await liaraGet(path, query);
  const cuts: Record<string, number> = {};
  const trimmed = opts.truncate === false ? r.body : truncateArrays(r.body, '$', cuts);
  const body = redactDeep(trimmed, secrets);
  const entry: Captured = {
    name,
    source,
    path,
    query,
    status: r.status,
    durationMs: r.ms,
    body,
    ...(r.error ? { error: r.error } : {}),
  };
  captured.push(entry);

  const displayPath = APP ? path.split(APP).join('{app}') : path;
  const fixture = {
    request: { method: 'GET', path: displayPath, query },
    source,
    status: r.status,
    durationMs: r.ms,
    capturedAt: new Date().toISOString(),
    ...(Object.keys(cuts).length ? { truncated: cuts } : {}),
    ...(r.error ? { error: r.error } : {}),
    body,
  };
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
  try {
    assertClean(serialized, secrets);
    writeFileSync(resolve(FIXTURE_DIR, `${name}.json`), serialized);
  } catch (err) {
    console.error(
      `  NOT WRITTEN ${name}.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log(
    `${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)} ms  GET ${displayPath}  ${r.error ?? shape(body)}`,
  );
  return entry;
}

// zod at the boundary: loose schemas, only for the fields this spike extracts.
const MeSchema = z.object({
  plans: z
    .object({
      projects: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      projectBundlePlans: z
        .record(z.string(), z.record(z.string(), z.record(z.string(), z.unknown())))
        .optional(),
    })
    .optional(),
});

function amount(v: unknown): unknown {
  return typeof v === 'object' && v !== null && 'amount' in v
    ? (v as { amount: unknown }).amount
    : v;
}

function planTable(me: unknown): string {
  const parsed = MeSchema.safeParse(me);
  if (!parsed.success || !parsed.data.plans?.projects) return '(v1/me has no plans.projects)';
  const { projects, projectBundlePlans = {} } = parsed.data.plans;
  const rows = Object.entries(projects).map(([id, p]) => {
    const price = typeof p.price === 'number' ? p.price : undefined;
    const bundles = Object.entries(projectBundlePlans[id] ?? {})
      .map(([bid, b]) => `${bid}=${String(b.displayPrice ?? '?')}`)
      .join(', ');
    return `| ${id} | ${String(p.available)} | ${String(p.region)} | ${String(amount(p.RAM))} | ${String(amount(p.CPU))} | ${String(p.volume)} | ${price ?? '?'} | ${price !== undefined ? price * 720 : '?'} | ${bundles || '-'} |`;
  });
  return [
    '| planID | available | region | RAM | CPU | volume | price/h | ×720 | bundles (id=displayPrice) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function countItems(body: unknown): string {
  // v2 logs group lines per release: count the lines, not the groups.
  const v2 = V2LogsResponse.safeParse(body);
  if (v2.success && !Array.isArray(body))
    return `${v2.data.data.reduce((n, g) => n + g.values.length, 0)} lines in ${v2.data.data.length} groups`;
  if (Array.isArray(body)) return `array(${body.length})`;
  if (typeof body === 'object' && body !== null) {
    const arrays = Object.entries(body).filter(([, v]) => Array.isArray(v));
    if (arrays.length)
      return arrays.map(([k, v]) => `${k}: array(${(v as unknown[]).length})`).join(', ');
  }
  return shape(body);
}

async function main(): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  console.log(`Liara spike (GET only) → fixtures in ${FIXTURE_DIR}`);
  console.log(`Team mode: ${TEAM_ID ? 'on (LIARA_TEAM_ID set)' : 'off (personal account)'}\n`);

  const me = await capture(
    'v1-me',
    'spec account_user_get-current-user-and-console-information.md; CLI commands/plan/list.ts:21',
    '/v1/me',
    {},
    { truncate: false },
  );
  await capture(
    'v1-billing',
    'spec billing_billing_get-current-user-billing-information.md',
    '/v1/billing',
  );
  await capture('v1-networks', 'CLI commands/network/list.ts:22', '/v1/networks');
  const projects = await capture(
    'v1-projects',
    'spec pass_apps_get-details-of-all-projects.md',
    '/v1/projects',
  );

  // The app name is `project_id`; there is no `name` field (fixture v1-projects.json).
  const parsedProjects = ProjectsResponse.safeParse(projects.body);
  const names = parsedProjects.success ? parsedProjects.data.projects.map((p) => p.project_id) : [];
  if (!parsedProjects.success && projects.status === 200)
    console.log(`  v1/projects did not match ProjectsResponse: ${parsedProjects.error.message}`);

  if (!APP) {
    console.log(
      `\nNo app given. Your apps: ${names.join(', ') || '(none)'}\nRe-run: pnpm spike:liara <app-name>`,
    );
  } else {
    if (names.length && !names.includes(APP))
      console.log(`  warning: "${APP}" is not in v1/projects (${names.join(', ')})`);
    const app = encodeURIComponent(APP);
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;

    await capture(
      'v1-project',
      'spec pass_apps_get-details-of-a-project.md',
      `/v1/projects/${app}`,
    );
    const v1Logs = await capture(
      'v1-project-logs',
      'spec pass_apps_get-logs-of-app.md',
      `/v1/projects/${app}/logs`,
      { since: String(hourAgo) },
    );
    if (v1Logs.status >= 400 && v1Logs.status < 500) {
      await capture(
        'v1-project-logs-iso',
        'spec pass_apps_get-logs-of-app.md (ISO since)',
        `/v1/projects/${app}/logs`,
        {
          since: new Date(hourAgo * 1000).toISOString(),
        },
      );
    }
    await capture(
      'v2-project-logs',
      'CLI commands/app/logs.ts:227-238',
      `/v2/projects/${app}/logs`,
      {
        start: String(hourAgo),
        direction: 'forward',
        last_lines: 'false',
      },
    );
    await capture(
      'v1-project-events',
      'spec pass_apps_get-events-of-the-app.md',
      `/v1/projects/${app}/events`,
    );
    const releases = await capture(
      'v1-project-releases',
      'spec pass_apps_get-releases-of-app.md',
      `/v1/projects/${app}/releases`,
      { page: '1', count: '10' },
    );
    await capture(
      'v1-project-metrics-summary',
      'spec pass_reports_get-summary-reports-of-app.md',
      `/v1/projects/${app}/metrics/summary`,
    );
    await capture(
      'v1-project-metrics-cpu',
      'spec pass_reports_get-cpu-reports-of-app.md',
      `/v1/projects/${app}/metrics/cpu`,
      { since: String(hourAgo) },
    );
    await capture(
      'v1-project-metrics-memory',
      'spec pass_reports_get-memory-reports-of-app.md',
      `/v1/projects/${app}/metrics/memory`,
      { since: String(hourAgo) },
    );

    const parsedReleases = ReleasesResponse.safeParse(releases.body);
    const latest = parsedReleases.success ? parsedReleases.data.releases[0]?._id : undefined;
    if (latest) {
      await capture(
        'v1-release',
        'CLI commands/deploy.ts:488',
        `/v1/releases/${encodeURIComponent(latest)}`,
      );
      // The CLI's first poll sends since=undefined (services/build-logs.ts:26); we omit the param instead.
      await capture(
        'v2-release-build-logs',
        'CLI services/build-logs.ts:26',
        `/v2/releases/${encodeURIComponent(latest)}/build-logs`,
      );
    } else {
      console.log('  no release found; skipping v1/releases/{id} and build-logs');
    }
  }

  const byName = new Map(captured.map((c) => [c.name, c]));
  const logsLine = (n: string): string => {
    const c = byName.get(n);
    return c ? `HTTP ${c.status}, ${countItems(c.body)}, shape ${shape(c.body)}` : 'not called';
  };

  console.log('\n----- PASTE EVERYTHING BELOW BACK TO CLAUDE -----');
  console.log(
    `### Liara spike (${new Date().toISOString()}, app ${APP ? '`{app}`' : 'none'}, team mode ${TEAM_ID ? 'on' : 'off'})`,
  );
  console.log('| fixture | GET | status | ms | shape |\n|---|---|---|---|---|');
  for (const c of captured) {
    const path = APP ? c.path.split(encodeURIComponent(APP)).join('{app}') : c.path;
    const q = Object.keys(c.query).length ? `?${new URLSearchParams(c.query).toString()}` : '';
    console.log(
      `| ${c.name} | \`${path}${q}\` | ${c.status} | ${c.durationMs} | ${(c.error ?? shape(c.body)).replace(/\|/g, '\\|')} |`,
    );
  }
  console.log('\n#### Plans from v1/me');
  console.log(planTable(me.body));
  console.log('\n#### Logs v1 vs v2');
  console.log(`- v1 \`?since=unix\`: ${logsLine('v1-project-logs')}`);
  if (byName.has('v1-project-logs-iso'))
    console.log(`- v1 \`?since=ISO\`: ${logsLine('v1-project-logs-iso')}`);
  console.log(`- v2 \`?start&direction&last_lines\`: ${logsLine('v2-project-logs')}`);
}

main().catch((err: unknown) => {
  console.error(
    `spike-liara crashed: ${redactString(err instanceof Error ? err.message : String(err), secrets)}`,
  );
  process.exit(1);
});
