// Timeline/audit events (CLAUDE.md non-negotiable 5): every operation's start, success, failure or unknown outcome.

export type Actor = 'web' | 'mcp' | 'cli' | 'worker' | 'system';
export type EventType = 'operation' | 'llm_call' | 'info';
export type EventStatus = 'start' | 'success' | 'failure' | 'unknown' | 'info';
/** How a tool ran: read (tier 0), auto (tier 1, no human), approved (tier ≥ 2 after approve). */
export type ExecMode = 'read' | 'auto' | 'approved';

export interface LlmUsage {
  job: string;
  model: string;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  /** BoxAPI `usage.cost`, USD. */
  costUsd?: number | undefined;
  latencyMs: number;
}

export interface TimelineEvent {
  id: string;
  operationId: string;
  type: EventType;
  status: EventStatus;
  tool?: string | undefined;
  app?: string | undefined;
  tier?: number | undefined;
  mode?: ExecMode | undefined;
  actor: Actor;
  messageFa: string;
  messageEn: string;
  /** Redacted. */
  errorRaw?: unknown;
  errorExplanationFa?: string | undefined;
  llm?: LlmUsage | undefined;
  /** Redacted; sensitive tool args masked. */
  data?: unknown;
  createdAt: Date;
}

export interface TimelineSink {
  write(event: TimelineEvent): Promise<void>;
  /** Start events of auto-executed runs of `tool` on `app` since `since` (circuit breaker, policy/breaker.ts). */
  countAutoStarts(query: { tool: string; app: string; since: Date }): Promise<number>;
  list(query?: { app?: string; operationId?: string; limit?: number }): Promise<TimelineEvent[]>;
}
