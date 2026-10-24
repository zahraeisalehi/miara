// Tool contract: name, zod input, risk tier (D19), Persian + English description, handler.
// Handlers run only through the policy gate (policy/gate.ts); the registry exposes metadata only.
import type { z } from 'zod';

import type { LiaraClient } from '../liara/client.js';
import type { HttpProbe } from '../probe/index.js';
import type { AppScope } from '../policy/scope.js';

/** An incident as the handoff tools see it (db/incidents.ts reads the `incidents` table). */
export interface Incident {
  id: string;
  app: string;
  status: string;
  rule: string;
  severity: string;
  titleFa: string;
  summary: string | null;
  openedAt: Date;
}

export interface IncidentReader {
  listOpen(): Promise<Incident[]>;
}

export type Tier = 0 | 1 | 2 | 3;

/** What a handler may use. Deliberately no policy gate here: a tool can never approve or execute another tool. */
export interface ToolContext {
  liara: LiaraClient;
  incidents: IncidentReader;
  /** D21: the apps Miara may see or touch. The gate enforces it for `appOf`; list tools filter with it. */
  scope: AppScope;
  now: () => Date;
  /** GET https://<app>.liara.run<path> (probe/index.ts). */
  probe: HttpProbe;
  /** Waits between verify polls (instant in tests). */
  sleep: (ms: number) => Promise<void>;
}

export interface CostPreview {
  currency: 'toman';
  vatRate: number;
  current?: { planID: string; bundlePlanID: string; monthly: number; monthlyWithVat: number };
  next: { planID: string; bundlePlanID: string; monthly: number; monthlyWithVat: number };
  deltaMonthlyWithVat?: number;
  noteFa: string;
  noteEn: string;
}

/** Which tier-1 circuit breaker a tool counts against (policy/breaker.ts). */
export type BreakerKind = 'restart' | 'deploy';

export interface ToolDef<I extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  description: { fa: string; en: string };
  /** Static tier. The gate uses max(tier, tierFor, breaker escalation). */
  tier: Tier;
  input: I;
  /** The app the call targets (timeline, breaker). */
  appOf?(args: z.infer<I>): string | undefined;
  /** Per-call tier; a throw counts as tier 2 (fail closed). */
  tierFor?(args: z.infer<I>, ctx: ToolContext): Promise<Tier> | Tier;
  breaker?: BreakerKind;
  /** Arg paths masked in everything returned or logged. An object at a path keeps its keys, values masked. */
  sensitive?: readonly string[];
  /** Validates against live state and enriches args before hashing (e.g. archive sha256). */
  prepare?(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<I>>;
  /** Tier 3 only. */
  costPreview?(args: z.infer<I>, ctx: ToolContext): Promise<CostPreview>;
  /** Tier 3: the text the human must type at approve. */
  confirmationText?(args: z.infer<I>): string;
  /** After an unknown outcome: re-read state so the timeline can say what actually happened. */
  reconcile?(args: z.infer<I>, ctx: ToolContext): Promise<unknown>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<O>;
}

/** Erased input type, so tools of different shapes fit in one list (method params are bivariant). */
export type AnyToolDef = ToolDef<z.ZodType, unknown>;

export function defineTool<I extends z.ZodType, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}

/** A tool-level refusal with a plain explanation (bad input against live state, unsafe archive, …). */
export class ToolInputError extends Error {
  readonly messageFa: string;
  readonly messageEn: string;
  constructor(messageFa: string, messageEn: string) {
    super(messageEn);
    this.name = 'ToolInputError';
    this.messageFa = messageFa;
    this.messageEn = messageEn;
  }
}

/** A corrective action ran, but its verify step did not confirm the app is healthy. `raw` holds the last checks. */
export class VerifyError extends Error {
  readonly messageFa: string;
  readonly messageEn: string;
  readonly raw: unknown;
  constructor(messageFa: string, messageEn: string, raw: unknown) {
    super(messageEn);
    this.name = 'VerifyError';
    this.messageFa = messageFa;
    this.messageEn = messageEn;
    this.raw = raw;
  }
}
