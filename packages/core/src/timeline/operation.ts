// withOperation: start → success | failure | unknown, each with a plain Persian explanation.
import { randomUUID } from 'node:crypto';

import { LiaraError } from '../liara/errors.js';
import { redactDeep } from '../redact/index.js';

import type {
  Actor,
  EventStatus,
  ExecMode,
  LlmUsage,
  TimelineEvent,
  TimelineSink,
} from './types.js';

export interface TimelineOptions {
  sink: TimelineSink;
  secrets: readonly string[];
  now?: () => Date;
}

export interface OperationMeta {
  operationId?: string;
  tool: string;
  app?: string | undefined;
  tier: number;
  mode: ExecMode;
  actor: Actor;
  labelFa: string;
  labelEn: string;
  /** Already masked by the caller (tools' `sensitive` paths); redacted again here. */
  data?: unknown;
}

/** Errors that carry their own plain-language messages (LiaraError, PolicyError, LlmError). */
interface Explained {
  messageFa: string;
  messageEn: string;
  raw?: unknown;
}

function isExplained(err: unknown): err is Error & Explained {
  return err instanceof Error && 'messageFa' in err && 'messageEn' in err;
}

const STATUS_FA: Record<Exclude<EventStatus, 'info'>, string> = {
  start: 'شروع شد',
  success: 'انجام شد',
  failure: 'ناموفق بود',
  unknown: 'نتیجه مشخص نیست',
};
const STATUS_EN: Record<Exclude<EventStatus, 'info'>, string> = {
  start: 'started',
  success: 'succeeded',
  failure: 'failed',
  unknown: 'outcome unknown',
};

export function createTimeline(opts: TimelineOptions) {
  const now = opts.now ?? (() => new Date());
  const clean = (v: unknown): unknown =>
    v === undefined ? undefined : redactDeep(v, opts.secrets);

  async function write(event: Omit<TimelineEvent, 'id' | 'createdAt'>): Promise<TimelineEvent> {
    const full: TimelineEvent = {
      ...event,
      id: randomUUID(),
      createdAt: now(),
      data: clean(event.data),
      errorRaw: clean(event.errorRaw),
    };
    await opts.sink.write(full);
    return full;
  }

  function opEvent(
    meta: OperationMeta,
    operationId: string,
    status: Exclude<EventStatus, 'info'>,
    extra: Partial<TimelineEvent> = {},
  ): Omit<TimelineEvent, 'id' | 'createdAt'> {
    return {
      operationId,
      type: 'operation',
      status,
      tool: meta.tool,
      app: meta.app,
      tier: meta.tier,
      mode: meta.mode,
      actor: meta.actor,
      messageFa: `${meta.labelFa}: ${STATUS_FA[status]}`,
      messageEn: `${meta.labelEn}: ${STATUS_EN[status]}`,
      ...extra,
    };
  }

  return {
    sink: opts.sink,
    write,

    /**
     * Runs `fn` between a start and an end event. A LiaraError `unknown_outcome` is recorded as `unknown`
     * (never `failure`), then `reconcile` re-reads the app state into an `info` event. The error is rethrown.
     */
    async withOperation<T>(
      meta: OperationMeta,
      fn: (operationId: string) => Promise<T>,
      reconcile?: () => Promise<unknown>,
    ): Promise<T> {
      const operationId = meta.operationId ?? randomUUID();
      await write(opEvent(meta, operationId, 'start', { data: meta.data }));
      try {
        const result = await fn(operationId);
        await write(opEvent(meta, operationId, 'success'));
        return result;
      } catch (err) {
        const explained = isExplained(err);
        const errorRaw = {
          name: err instanceof Error ? err.name : 'Error',
          message: err instanceof Error ? err.message : String(err),
          ...(err instanceof LiaraError
            ? { kind: err.kind, status: err.status, endpoint: err.endpoint }
            : {}),
          ...(explained && err.raw !== undefined ? { raw: err.raw } : {}),
        };
        const unknown = err instanceof LiaraError && err.kind === 'unknown_outcome';
        await write(
          opEvent(meta, operationId, unknown ? 'unknown' : 'failure', {
            errorRaw,
            errorExplanationFa: explained
              ? err.messageFa
              : 'خطای داخلی میارا؛ جزئیات فنی در همین رویداد ثبت شده است.',
          }),
        );
        if (unknown && reconcile) {
          try {
            const state = await reconcile();
            await write({
              operationId,
              type: 'info',
              status: 'info',
              tool: meta.tool,
              app: meta.app,
              actor: meta.actor,
              messageFa: 'وضعیت فعلی اپ دوباره خوانده شد تا نتیجه روشن شود.',
              messageEn: 'Re-read the app state to settle the unclear result.',
              data: state,
            });
          } catch (reErr) {
            await write({
              operationId,
              type: 'info',
              status: 'info',
              tool: meta.tool,
              app: meta.app,
              actor: meta.actor,
              messageFa: 'بازخوانی وضعیت اپ هم ناموفق بود؛ وضعیت را در کنسول لیارا بررسی کنید.',
              messageEn: 'Re-reading the app state failed too; check the Liara console.',
              errorRaw: { message: reErr instanceof Error ? reErr.message : String(reErr) },
            });
          }
        }
        throw err;
      }
    },

    /** One event per LLM call, with tokens and BoxAPI's usage.cost (docs/boxapi/README.md). */
    recordLlm(
      usage: LlmUsage,
      ctx: { operationId?: string; actor: Actor; ok: boolean; error?: unknown },
    ) {
      return write({
        operationId: ctx.operationId ?? randomUUID(),
        type: 'llm_call',
        status: ctx.ok ? 'success' : 'failure',
        actor: ctx.actor,
        messageFa: `فراخوانی مدل زبانی (${usage.job})`,
        messageEn: `LLM call (${usage.job})`,
        llm: usage,
        ...(ctx.error !== undefined
          ? {
              errorRaw: {
                message: ctx.error instanceof Error ? ctx.error.message : String(ctx.error),
              },
            }
          : {}),
      });
    },
  };
}

export type Timeline = ReturnType<typeof createTimeline>;
