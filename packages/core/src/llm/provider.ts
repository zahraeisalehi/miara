// Provider interface (ARCHITECTURE "LLM layer"). The model never calls tools; it returns text or zod-checked JSON.
import type { z } from 'zod';

import type { Actor } from '../timeline/types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Usage {
  model: string;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  /** BoxAPI `usage.cost`, USD. */
  costUsd?: number | undefined;
  latencyMs: number;
}

/** Which job made the call; ends up on the timeline. */
export type LlmJob = 'router' | 'diagnoser' | 'narrator' | (string & {});

export interface CallOptions {
  job: LlmJob;
  operationId?: string;
  actor?: Actor;
  maxTokens?: number;
}

export interface LlmProvider {
  complete(messages: ChatMessage[], opts: CallOptions): Promise<{ text: string; usage: Usage }>;
  stream(
    messages: ChatMessage[],
    opts: CallOptions,
  ): { textStream: AsyncIterable<string>; usage: Promise<Usage> };
  completeJSON<S extends z.ZodType>(
    schema: S,
    messages: ChatMessage[],
    opts: CallOptions & { name: string },
  ): Promise<{ data: z.infer<S>; usage: Usage }>;
}

export type LlmErrorKind = 'http' | 'timeout' | 'network' | 'invalid_response' | 'invalid_json';

const MESSAGES: Record<LlmErrorKind, { fa: string; en: string }> = {
  http: { fa: 'سرویس مدل زبانی خطا داد.', en: 'The LLM service returned an error.' },
  timeout: { fa: 'مدل زبانی به‌موقع پاسخ نداد.', en: 'The LLM did not answer in time.' },
  network: { fa: 'ارتباط با سرویس مدل زبانی برقرار نشد.', en: 'Could not reach the LLM service.' },
  invalid_response: {
    fa: 'پاسخ سرویس مدل زبانی قالب درستی نداشت.',
    en: 'The LLM service returned an unexpected response.',
  },
  invalid_json: {
    fa: 'مدل زبانی حتی بعد از یک بار اصلاح، خروجی معتبر نداد. از دکمه‌های سریع استفاده کنید.',
    en: 'The LLM output stayed invalid after one repair attempt. Use the quick actions instead.',
  },
};

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status: number;
  readonly messageFa: string;
  readonly messageEn: string;
  readonly raw: unknown;

  constructor(kind: LlmErrorKind, raw?: unknown, status = 0, detail?: string) {
    super(detail ? `${MESSAGES[kind].en} (${detail})` : MESSAGES[kind].en);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
    this.messageFa = MESSAGES[kind].fa;
    this.messageEn = this.message;
    this.raw = raw;
  }
}
