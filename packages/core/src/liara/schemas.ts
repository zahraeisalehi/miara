// zod schemas for every Liara response seen live in Spike B (fixtures: test/fixtures/liara/, captured 2026-10-22).
// Objects are loose (zod 4's name for passthrough): unknown fields are kept and never fail a parse.
// Required = a field core actually reads (marked `used:`). Everything else observed is optional, and nullish
// unless we have seen it as a non-null value everywhere. Never loosen a used field to unknown.
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

// Not read by core (only `plans` is); kept typed for the UI.
const Account = z.looseObject({
  _id: z.string().nullish(),
  isTeam: z.boolean().nullish(),
  accountType: z.string().nullish(),
  minCreditAmount: z.number().nullish(),
});

export const MeResponse = z.looseObject({
  user: Account.nullish(),
  /** Present in team mode (`teamID` set). */
  team: Account.extend({
    teamName: z.string().nullish(),
    balance: z.number().nullish(),
    teamMemberRole: z
      .looseObject({
        name: z.string().nullish(),
        permissions: z
          .array(z.looseObject({ name: z.string().nullish(), type: z.string().nullish() }))
          .nullish(),
      })
      .nullish(),
  }).nullish(),
  /** used: liara/plans.ts */
  plans: z.looseObject({
    /** Keys are planIDs, e.g. `small-g2`. */
    projects: z.record(z.string(), ProjectPlan),
    /** planID → bundlePlanID (`free` | `basic` | `standard` | `pro` | `default`) → bundle. */
    projectBundlePlans: z.record(z.string(), z.record(z.string(), BundlePlan)),
  }),
});

// ---- GET /v1/billing (spec billing_billing_get-current-user-billing-information.md)

const BillingAccount = z.looseObject({
  balance: z.number(), // used: getBalance (toman)
  minCreditAmount: z.number(), // used: getBalance
  accountType: z.string().nullish(),
  isManualMinCredit: z.boolean().nullish(),
});

export const BillingResponse = z.looseObject({
  user: BillingAccount,
  /** Present in team mode; use it instead of `user` when LIARA_TEAM_ID is set. */
  team: BillingAccount.nullish(),
});

// ---- GET /v1/networks (CLI commands/network/list.ts:22)

export const Network = z.looseObject({
  _id: z.string(), // used: create_app checks networkId
  name: z.string().nullish(),
  createdAt: z.string().nullish(),
  projectCount: z.number().nullish(),
  databaseCount: z.number().nullish(),
});

export const NetworksResponse = z.looseObject({ networks: z.array(Network) });

// ---- GET /v1/projects, /v1/projects/{app} (spec pass_apps_get-details-of-all-projects.md, …-of-a-project.md)

export const ProjectSummary = z.looseObject({
  /** used: the app name in every /v1/projects/{app} path. */
  project_id: z.string(),
  status: z.string(), // used: appState (e.g. ACTIVE)
  scale: z.number(), // used: appState
  planID: z.string(), // used: change_plan cost preview
  bundlePlanID: z.string(), // used: change_plan cost preview
  _id: z.string().nullish(),
  type: z.string().nullish(), // platform, e.g. node, docker
  network: z.looseObject({ _id: z.string().nullish(), name: z.string().nullish() }).nullish(),
  created_at: z.string().nullish(),
  isDeployed: z.boolean().nullish(),
});

export const ProjectsResponse = z.looseObject({ projects: z.array(ProjectSummary) });

export const ProjectEnv = z.looseObject({
  key: z.string(), // used: set_env merge
  value: z.string(), // used: set_env merge
  encrypted: z.boolean().nullish(),
});

export const ProjectDetails = ProjectSummary.extend({
  envs: z.array(ProjectEnv), // used: set_env merge
  readOnlyRootFilesystem: z.boolean().nullish(),
  zeroDowntime: z.boolean().nullish(),
  /** D15: the free *.liara.run address (read by the D15 warning, not by Phase 1b code). */
  defaultSubdomain: z.boolean().nullish(),
  defaultSubdomainExpired: z.boolean().nullish(),
  keepDefaultSubdomain: z.boolean().nullish(),
  dns: z.array(z.unknown()).nullish(),
  hourlyPrice: z.number().nullish(), // plan part, toman/hour
  bundleHourlyPrice: z.number().nullish(), // bundle part, toman/hour
  reservedDiskSpace: z.number().nullish(),
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
      metaData: z.looseObject({ releaseId: z.string().nullish() }).nullish(),
      values: z.array(z.tuple([z.string(), z.string()])), // used: logs.ts flattenV2
    }),
  ),
});

/** The decoded second element of a V2LogsResponse value. */
export const V2LogEntry = z.looseObject({ type: z.string(), _entry: z.string() });

// ---- GET /v1/projects/{app}/events (spec pass_apps_get-events-of-the-app.md)

export const EventsResponse = z.looseObject({
  // Not read by core yet (Phase 5 evidence packs will); typed for that.
  data: z.array(
    z.looseObject({
      id: z.string().nullish(), // container id
      status: z.string().nullish(), // create | start | kill | stop | die | …
      action: z.string().nullish(),
      time: z.string().nullish(), // unix seconds, as a string
      release: z.string().nullish(),
      tag: z.string().nullish(), // release tag, e.g. v2
    }),
  ),
});

// ---- Releases (spec pass_apps_get-releases-of-app.md; CLI commands/deploy.ts:488, services/build-logs.ts:26)

export const Release = z.looseObject({
  _id: z.string(), // used: deploy reconcile
  // used: READY | FAILED | CANCELED | TIMEDOUT | UNHEALTHY | DEPLOYING | … (CLI services/build-logs.ts:50-82)
  state: z.string(),
  createdAt: z.string(), // used: deploy reconcile
  type: z.string().nullish(), // DEPLOY
  projectType: z.string().nullish(),
  finishedAt: z.string().nullish(),
  tag: z.string().nullish(),
  port: z.number().nullish(),
  imageName: z.string().nullish(),
  buildLocation: z.string().nullish(),
  sourceAvailable: z.boolean().nullish(),
  queue: z.number().nullish(), // CLI commands/deploy.ts:485-506
  failReason: z.string().nullish(),
});

/** GET /v1/projects/{app}/releases?page=&count= */
export const ReleasesResponse = z.looseObject({
  releases: z.array(Release), // used
  currentRelease: z.string().nullish(), // used: deploy reconcile
  total: z.number().nullish(),
  readyReleasesCount: z.number().nullish(),
  platform: z.string().nullish(),
});

/** GET /v1/releases/{releaseID} */
export const ReleaseResponse = z.looseObject({ release: Release });

/** GET /v2/releases/{releaseID}/build-logs?since=<createdAt of last line> */
export const BuildLogsResponse = z.looseObject({
  release: z.looseObject({
    state: z.string(), // used: build polling (Phase 3)
    status: z.string().nullish(),
    failReason: z.string().nullish(),
  }),
  buildOutput: z.array(
    z.looseObject({
      line: z.string(), // used
      stream: z.string(), // used: anything but STDOUT means the build failed (CLI services/build-logs.ts:30-46)
      createdAt: z.string(), // used: the next poll's `since`
      _id: z.string().nullish(),
      releaseID: z.string().nullish(),
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

// Only the list length is read (set_env tierFor); fields typed for the domain workflow.
export const Domain = z.looseObject({
  _id: z.string().nullish(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  project: z.looseObject({ _id: z.string().nullish(), project_id: z.string().nullish() }).nullish(),
  status: z.string().nullish(),
  certificatesStatus: z.string().nullish(),
});

/** GET /v1/domains?project={app} */
export const DomainsResponse = z.looseObject({ domains: z.array(Domain) });

// ---- Write responses. Each stays as loose as its spec until a live call shows the real shape.

/** Scale, update-envs, resize, create app: the specs document only a status (and maybe `message`). Not observed live yet. */
export const WriteAck = z.unknown();

/**
 * POST /v1/projects/{app}/actions/restart. ✅ Live (2026-10-23, fixture write-v1-projects-app-actions-restart.json):
 * a 2xx with an empty body, parsed as null (spec pass_apps_to-restart-a-app.md: 200, no content). Miara reads no
 * field from it, so an object body is also accepted; anything else is a shape change worth surfacing.
 */
export const RestartAck = z.union([z.null(), z.looseObject({})]);

/** POST /v2/projects/{app}/sources (spec pass_deploy_deploy-sources-code.md; CLI services/upload.ts:6-8) */
export const SourceUploadResponse = z.looseObject({ sourceID: z.string() });

/** POST /v2/projects/{app}/releases (spec pass_deploy_deploy-releases.md; CLI types/created-release.ts) */
export const CreatedReleaseResponse = z.looseObject({ releaseID: z.string() });
