// OpenAI-compatible chat provider: BoxAPI now, Liara AI later through config (D4). Plain fetch, so BoxAPI's
// `usage.cost` survives and raw bodies can be recorded as fixtures. Never sends `tools` (BoxAPI has no tool calling).
import { z } from 'zod';

import { redactString } from '../redact/index.js';
import type { Timeline } from '../timeline/operation.js';
import { issueLine, summarizeIssues } from '../util/zod-issues.js';

import { parseJsonContent, strictJsonSchema } from './json.js';
import { LlmError } from './provider.js';
import type { CallOptions, ChatMessage, LlmProvider, Usage } from './provider.js';
import { sseJson } from './sse.js';

export const BOXAPI_BASE_URL = 'https://ai.boxapi.ir/ai/v1';
export const LLM_TIMEOUT_MS = 60_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface OpenAICompatibleOptions {
  baseUrl?: string;
  apiKey: string;
  model: string;
  secrets: readonly string[];
  timeline?: Timeline;
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Spike A: "low" is accepted and used for every call. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

const UsageBody = z
  .looseObject({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    reasoning_tokens: z.number().optional(),
    completion_tokens_details: z.looseObject({ reasoning_tokens: z.number().optional() }).nullish(),
    cost: z.number().optional(),
  })
  .nullish();

const Completion = z.looseObject({
  model: z.string().optional(),
  choices: z
    .array(z.looseObject({ message: z.looseObject({ content: z.string().nullable() }) }))
    .min(1),
  usage: UsageBody,
});

const Chunk = z.looseObject({
  choices: z
    .array(z.looseObject({ delta: z.looseObject({ content: z.string().nullish() }).nullish() }))
    .nullish(),
  usage: UsageBody,
});

function toUsage(model: string, body: z.infer<typeof UsageBody>, latencyMs: number): Usage {
  return {
    model,
    promptTokens: body?.prompt_tokens,
    completionTokens: body?.completion_tokens,
    reasoningTokens: body?.completion_tokens_details?.reasoning_tokens ?? body?.reasoning_tokens,
    costUsd: body?.cost,
    latencyMs,
  };
}

const sumUsage = (a: Usage, b: Usage): Usage => {
  const add = (x?: number, y?: number) =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  return {
    model: b.model,
    promptTokens: add(a.promptTokens, b.promptTokens),
    completionTokens: add(a.completionTokens, b.completionTokens),
    reasoningTokens: add(a.reasoningTokens, b.reasoningTokens),
    costUsd: add(a.costUsd, b.costUsd),
    latencyMs: a.latencyMs + b.latencyMs,
  };
};

export function createOpenAICompatibleProvider(opts: OpenAICompatibleOptions): LlmProvider {
  const baseUrl = opts.baseUrl ?? BOXAPI_BASE_URL;
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
  const effort = opts.reasoningEffort ?? 'low';

  async function post(body: Record<string, unknown>): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
        // `tools` is never part of the body.
        body: JSON.stringify({ model: opts.model, reasoning_effort: effort, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new LlmError(
        timedOut ? 'timeout' : 'network',
        redactString(err instanceof Error ? err.message : String(err), opts.secrets),
      );
    }
    if (!res.ok) {
      throw new LlmError(
        'http',
        redactString((await res.text()).slice(0, 1000), opts.secrets),
        res.status,
      );
    }
    return res;
  }

  async function record(usage: Usage, call: CallOptions, ok: boolean, error?: unknown) {
    await opts.timeline?.recordLlm(
      { job: call.job, ...usage },
      {
        actor: call.actor ?? 'system',
        ok,
        ...(call.operationId ? { operationId: call.operationId } : {}),
        ...(error !== undefined ? { error } : {}),
      },
    );
  }

  async function completeRaw(
    messages: ChatMessage[],
    call: CallOptions,
    extra: Record<string, unknown> = {},
  ): Promise<{ text: string; usage: Usage }> {
    const started = performance.now();
    try {
      const res = await post({
        messages,
        ...(call.maxTokens ? { max_completion_tokens: call.maxTokens } : {}),
        ...extra,
      });
      const parsed = Completion.safeParse(await res.json());
      if (!parsed.success) {
        throw new LlmError(
          'invalid_response',
          { issues: summarizeIssues(parsed.error.issues) },
          res.status,
          `schema mismatch at ${issueLine(parsed.error.issues)}`,
        );
      }
      const usage = toUsage(
        parsed.data.model ?? opts.model,
        parsed.data.usage,
        Math.round(performance.now() - started),
      );
      await record(usage, call, true);
      return { text: parsed.data.choices[0]?.message.content ?? '', usage };
    } catch (err) {
      if (err instanceof LlmError) {
        await record(
          { model: opts.model, latencyMs: Math.round(performance.now() - started) },
          call,
          false,
          err,
        );
      }
      throw err;
    }
  }

  return {
    complete: (messages, call) => completeRaw(messages, call),

    stream(messages, call) {
      let resolveUsage!: (u: Usage) => void;
      let rejectUsage!: (e: unknown) => void;
      const usage = new Promise<Usage>((res, rej) => {
        resolveUsage = res;
        rejectUsage = rej;
      });
      usage.catch(() => {}); // surfaced through textStream; avoid an unhandled rejection
      async function* textStream(): AsyncGenerator<string> {
        const started = performance.now();
        let usageBody: z.infer<typeof UsageBody> = undefined;
        try {
          const res = await post({
            messages,
            stream: true,
            stream_options: { include_usage: true },
            ...(call.maxTokens ? { max_completion_tokens: call.maxTokens } : {}),
          });
          if (!res.body) throw new LlmError('invalid_response', 'empty stream body');
          for await (const raw of sseJson(res.body)) {
            const chunk = Chunk.safeParse(raw);
            if (!chunk.success) continue;
            if (chunk.data.usage) usageBody = chunk.data.usage;
            const delta = chunk.data.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          }
          const u = toUsage(opts.model, usageBody, Math.round(performance.now() - started));
          await record(u, call, true);
          resolveUsage(u);
        } catch (err) {
          await record(
            { model: opts.model, latencyMs: Math.round(performance.now() - started) },
            call,
            false,
            err,
          );
          rejectUsage(err);
          throw err;
        }
      }
      return { textStream: textStream(), usage };
    },

    async completeJSON(schema, messages, call) {
      const responseFormat = {
        type: 'json_schema',
        json_schema: { name: call.name, strict: true, schema: strictJsonSchema(schema) },
      };
      const first = await completeRaw(messages, call, { response_format: responseFormat });
      const tryParse = (text: string) => {
        try {
          const result = schema.safeParse(parseJsonContent(text));
          return result.success
            ? { ok: true as const, data: result.data }
            : {
                ok: false as const,
                issues: result.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`),
              };
        } catch {
          return { ok: false as const, issues: ['not valid JSON'] };
        }
      };
      const a = tryParse(first.text);
      if (a.ok) return { data: a.data, usage: first.usage };

      // One repair retry (ARCHITECTURE "LLM layer").
      const repair = await completeRaw(
        [
          ...messages,
          { role: 'assistant', content: first.text },
          {
            role: 'user',
            content: `Your previous answer did not match the required JSON schema: ${a.issues.join('; ')}. Reply again with only the corrected JSON.`,
          },
        ],
        call,
        { response_format: responseFormat },
      );
      const b = tryParse(repair.text);
      if (b.ok) return { data: b.data, usage: sumUsage(first.usage, repair.usage) };
      throw new LlmError('invalid_json', { issues: b.issues }, 0, b.issues.join('; '));
    },
  };
}
