// zod schemas for every Liara response seen live in Spike B (fixtures: test/fixtures/liara/, captured 2026-10-22).
// Objects are loose (zod 4's name for passthrough): unknown fields are kept and never fail a parse.
// Required fields are the ones the product reads; everything else observed is optional.
import { z } from 'zod';

/** Liara's 4xx/5xx body, e.g. v1 logs with an ISO `since`: 400 "The `since` parameter must be a number." */
export const ErrorBody = z.looseObject({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
});

/** Plan/bundle limits are numbers or the string "infinite". */
const Limit = z.union([z.number(), z.literal('infinite')]);

// ---- GET /v1/me (spec account_user_get-current-user-and-console-information.md; CLI commands/plan/list.ts:21)

export const ProjectPlan = z.looseObject({
  available: z.boolean(),
  price: z.number(), // toman per hour; monthly = price * 720
  volume: z.number(), // GB disk
  RAM: z.looseObject({ amount: z.number(), shared: z.boolean().optional() }), // GB
  CPU: z.looseObject({ amount: z.number(), shared: z.boolean().optional() }), // cores
  region: z.string().optional(), // absent on some legacy plans
});

export const BundlePlan = z.looseObject({
  available: z.boolean(),
  price: z.number(), // toman per hour
  displayPrice: z.number(), // toman per month
  displayHourlyPrice: z.number().optional(),
  buildTimeout: z.number().optional(), // minutes
  maxLogsRetention: z.number().optional(), // days (free = 0.05)
  maxReportRetention: z.number().optional(), // days
  maxReleaseRetention: z.number().optional(),
  maxDomainsCount: Limit.optional(),
  maxDeploymentCountInDay: Limit.optional(),
  maxSourceSize: z.number().optional(), // MB
  maxDiskPerProject: z.number().optional(),
  rollback: z.boolean().optional(),
  zeroDowntime: z.boolean().optional(),
  setDNS: z.boolean().optional(),
  setReadOnly: z.boolean().optional(),
  germanyBuilder: z.boolean().optional(),
  freeSSL: z.boolean().optional(),
  backupSpace: z.number().optional(),
  availableBackupInterval: z.array(z.string()).optional(),
});

const Account = z.looseObject({
  _id: z.string(),
  isTeam: z.boolean(),
  accountType: z.string(),
  minCreditAmount: z.number().optional(),
});

export const MeResponse = z.looseObject({
  user: Account,
  /** Present in team mode (`teamID` set). */
  team: Account.extend({
    teamName: z.string().optional(),
    balance: z.number().optional(),
    teamMemberRole: z
      .looseObject({
        name: z.string(),
        permissions: z.array(z.looseObject({ name: z.string(), type: z.string() })),
      })
      .optional(),
  }).optional(),
  plans: z.looseObject({
    /** Keys are planIDs, e.g. `small-g2`. */
    projects: z.record(z.string(), ProjectPlan),
    /** planID → bundlePlanID (`free` | `basic` | `standard` | `pro` | `default`) → bundle. */
    projectBundlePlans: z.record(z.string(), z.record(z.string(), BundlePlan)),
  }),
});

// ---- GET /v1/billing (spec billing_billing_get-current-user-billing-information.md)

const BillingAccount = z.looseObject({
  balance: z.number(), // toman
  accountType: z.string(),
  minCreditAmount: z.number(),
  isManualMinCredit: z.boolean().optional(),
});

export const BillingResponse = z.looseObject({
  user: BillingAccount,
  /** Present in team mode; use it instead of `user` when LIARA_TEAM_ID is set. */
  team: BillingAccount.optional(),
});

// ---- GET /v1/networks (CLI commands/network/list.ts:22)

export const Network = z.looseObject({
  _id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  projectCount: z.number().optional(),
  databaseCount: z.number().optional(),
});

export const NetworksResponse = z.looseObject({ networks: z.array(Network) });

// ---- GET /v1/projects, /v1/projects/{app} (spec pass_apps_get-details-of-all-projects.md, …-of-a-project.md)

export const ProjectSummary = z.looseObject({
  _id: z.string(),
  /** The app name used in every /v1/projects/{app} path. */
  project_id: z.string(),
  type: z.string(), // platform, e.g. node, docker
  status: z.string(), // e.g. ACTIVE
  scale: z.number(),
  planID: z.string(),
  bundlePlanID: z.string(),
  network: z.looseObject({ _id: z.string(), name: z.string() }).nullish(),
  created_at: z.string(),
  isDeployed: z.boolean().optional(),
});

export const ProjectsResponse = z.looseObject({ projects: z.array(ProjectSummary) });

export const ProjectEnv = z.looseObject({
  key: z.string(),
  value: z.string(),
  encrypted: z.boolean().optional(),
});

export const ProjectDetails = ProjectSummary.extend({
  envs: z.array(ProjectEnv),
  readOnlyRootFilesystem: z.boolean().optional(),
  zeroDowntime: z.boolean().optional(),
  /** D15: the free *.liara.run address. */
  defaultSubdomain: z.boolean(),
  defaultSubdomainExpired: z.boolean(),
  keepDefaultSubdomain: z.boolean(),
  dns: z.array(z.unknown()).optional(),
  hourlyPrice: z.number().optional(), // plan part, toman/hour
  bundleHourlyPrice: z.number().optional(), // bundle part, toman/hour
  reservedDiskSpace: z.number().optional(),
});

export const ProjectResponse = z.looseObject({ project: ProjectDetails });

// ---- Logs. Primary: v2 (CLI commands/app/logs.ts:227-238). Fallback: v1 (spec pass_apps_get-logs-of-app.md).

/** GET /v1/projects/{app}/logs?since=<unix seconds>. An ISO `since` is a 400. */
export const V1LogsResponse = z.array(
  z.looseObject({ type: z.string(), datetime: z.string(), message: z.string() }),
);

/**
 * GET /v2/projects/{app}/logs?start=<unix>&direction=forward&last_lines=false.
 * Lines come in groups per release; each value is [unix-nanoseconds string, JSON string of V2LogEntry].
 * Flatten and sort by timestamp, like the CLI (commands/app/logs.ts:245-247).
 */
export const V2LogsResponse = z.looseObject({
  data: z.array(
    z.looseObject({
      metaData: z.looseObject({ releaseId: z.string().optional() }),
      values: z.array(z.tuple([z.string(), z.string()])),
    }),
  ),
});

/** The decoded second element of a V2LogsResponse value. */
export const V2LogEntry = z.looseObject({ type: z.string(), _entry: z.string() });

// ---- GET /v1/projects/{app}/events (spec pass_apps_get-events-of-the-app.md)

export const EventsResponse = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(), // container id
      status: z.string(), // create | start | kill | stop | die | …
      action: z.string(),
      time: z.string(), // unix seconds, as a string
      release: z.string().optional(),
      tag: z.string().optional(), // release tag, e.g. v2
    }),
  ),
});

// ---- Releases (spec pass_apps_get-releases-of-app.md; CLI commands/deploy.ts:488, services/build-logs.ts:26)

export const Release = z.looseObject({
  _id: z.string(),
  type: z.string(), // DEPLOY
  state: z.string(), // READY | FAILED | CANCELED | TIMEDOUT | UNHEALTHY | DEPLOYING | … (CLI services/build-logs.ts:50-82)
  projectType: z.string().optional(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  tag: z.string().optional(),
  port: z.number().optional(),
  imageName: z.string().optional(),
  buildLocation: z.string().optional(),
  sourceAvailable: z.boolean().optional(),
  queue: z.number().optional(), // CLI commands/deploy.ts:485-506
  failReason: z.string().optional(),
});

/** GET /v1/projects/{app}/releases?page=&count= */
export const ReleasesResponse = z.looseObject({
  total: z.number(),
  currentRelease: z.string().nullish(),
  readyReleasesCount: z.number().optional(),
  releases: z.array(Release),
  platform: z.string().optional(),
});

/** GET /v1/releases/{releaseID} */
export const ReleaseResponse = z.looseObject({ release: Release });

/** GET /v2/releases/{releaseID}/build-logs?since=<createdAt of last line> */
export const BuildLogsResponse = z.looseObject({
  release: z.looseObject({
    state: z.string(),
    status: z.string().optional(),
    failReason: z.string().optional(),
  }),
  buildOutput: z.array(
    z.looseObject({
      _id: z.string(),
      line: z.string(),
      stream: z.string(), // anything but STDOUT means the build failed (CLI services/build-logs.ts:30-46)
      releaseID: z.string(),
      createdAt: z.string(),
    }),
  ),
});

// ---- Reports (spec pass_reports_get-{summary,cpu,memory}-reports-of-app.md)

/** [unix seconds, value as a decimal string]. CPU is cores; memory is bytes. */
const Sample = z.tuple([z.number(), z.string()]);

export const MetricsSummaryResponse = z.looseObject({
  cpuUsage: z.array(z.looseObject({ value: Sample, applet: z.string() })),
  memoryUsage: z.array(z.looseObject({ value: Sample, applet: z.string() })),
  disksUsage: z.array(z.unknown()),
});

/** GET /v1/projects/{app}/metrics/{cpu,memory}?since=<unix seconds>. One series per applet (container). */
export const MetricSeriesResponse = z.looseObject({
  end: z.number(),
  result: z.array(z.looseObject({ values: z.array(Sample), applet: z.string() })),
});

// ---- Domains (spec pass_domains_get-all-domains.md; CLI commands/deploy.ts:246). source: spec (unverified, no fixture yet).

export const Domain = z.looseObject({
  _id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  project: z
    .looseObject({ _id: z.string().optional(), project_id: z.string().optional() })
    .nullish(),
  status: z.string().optional(),
  certificatesStatus: z.string().optional(),
});

/** GET /v1/domains?project={app} */
export const DomainsResponse = z.looseObject({ domains: z.array(Domain) });

// ---- Write responses. No live write has run yet (Phase 1b is mocks only), so these stay as loose as the specs.

/** Restart, scale, update-envs, resize, create app: the specs document only a status (and maybe `message`). */
export const WriteAck = z.unknown();

/** POST /v2/projects/{app}/sources (spec pass_deploy_deploy-sources-code.md; CLI services/upload.ts:6-8) */
export const SourceUploadResponse = z.looseObject({ sourceID: z.string() });

/** POST /v2/projects/{app}/releases (spec pass_deploy_deploy-releases.md; CLI types/created-release.ts) */
export const CreatedReleaseResponse = z.looseObject({ releaseID: z.string() });
