// LLM adapter tests. Fixture-backed tests replay recorded BoxAPI bodies (test/fixtures/llm/, recorded with
// `pnpm spike:llm --record`) and skip with a message until those exist. Nothing here calls the live API.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RecordRouterOutput } from '../../scripts/record-llm.js';
import { createMemoryTimelineSink } from '../timeline/memory.js';
import type { TimelineEvent } from '../timeline/types.js';
import { createTimeline } from '../timeline/operation.js';

import { assertStrictCompatible, strictJsonSchema } from './json.js';
import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { LlmError } from './provider.js';
import type { Usage } from './provider.js';

const DIR = resolve(import.meta.dirname, '../../test/fixtures/llm');
const KEY = 'boxapi-test-key-0123456789';
const NAMES = ['chat', 'stream', 'json-schema-router'] as const;
const haveFixtures = NAMES.every((n) => existsSync(resolve(DIR, `${n}.json`)));
if (!haveFixtures) {
  process.stderr.write(
    '\n⚠ LLM fixtures missing: run "pnpm spike:llm --record" once. Fixture tests skipped.\n',
  );
}

interface Fixture {
  status: number;
  body?: { choices: { message: { content: string } }[]; usage?: Record<string, unknown> };
  sse?: string;
}
const fixture = (name: (typeof NAMES)[number]): Fixture =>
  JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8')) as Fixture;

/**
 * The usage BoxAPI actually returned in a fixture: `body.usage`, or the SSE chunk that carries `usage`.
 * Parsed with zod so a broken recording (e.g. redacted counts) fails here, loudly, as numbers or nothing.
 */
const RecordedUsage = z.looseObject({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  completion_tokens_details: z.looseObject({ reasoning_tokens: z.number() }).nullish(),
  reasoning_tokens: z.number().optional(),
  cost: z.number(),
});

function recordedUsage(f: Fixture): z.infer<typeof RecordedUsage> {
  let raw: unknown = f.body?.usage;
  if (f.sse) {
    for (const line of f.sse.split('\n')) {
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      const chunk = JSON.parse(line.slice(5)) as { usage?: unknown };
      if (chunk.usage) raw = chunk.usage;
    }
  }
  return RecordedUsage.parse(raw);
}

/** What the adapter must produce from that usage (OpenAI-style → Usage). Values come from the fixture, never literals. */
function expectedUsage(f: Fixture) {
  const u = recordedUsage(f);
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? u.reasoning_tokens,
    costUsd: u.cost,
  };
}

type Mapped = ReturnType<typeof expectedUsage>;

/** The adapter's Usage and the timeline's llm_call event both carry exactly the recorded numbers. */
function expectUsageMapped(
  usage: Usage,
  expected: Mapped,
  events: TimelineEvent[],
  job: string,
): void {
  for (const key of ['promptTokens', 'completionTokens', 'reasoningTokens', 'costUsd'] as const) {
    expect(typeof usage[key], key).toBe('number');
    expect(usage[key], key).toBeCloseTo(expected[key] ?? Number.NaN, 12);
  }
  const llmEvents = events.filter((e) => e.type === 'llm_call');
  expect(llmEvents.length).toBeGreaterThan(0);
  const recorded = llmEvents.at(-1)?.llm;
  expect(recorded).toMatchObject({ job, model: usage.model });
  for (const key of ['promptTokens', 'completionTokens', 'reasoningTokens', 'costUsd'] as const) {
    expect(recorded?.[key], `timeline ${key}`).toBe(usage[key]);
  }
}

/** A copy of a recorded body with the content replaced (fixture "derived-from" the recording). */
function withContent(f: Fixture, content: string): Fixture {
  const copy = structuredClone(f);
  const first = copy.body?.choices[0];
  if (first) first.message.content = content;
  return copy;
}

function setup(replies: Fixture[]) {
  const requests: Record<string, unknown>[] = [];
  const queue = [...replies];
  const sink = createMemoryTimelineSink();
  const provider = createOpenAICompatibleProvider({
    apiKey: KEY,
    model: 'gpt-5.4-mini',
    secrets: [KEY],
    timeline: createTimeline({ sink, secrets: [KEY] }),
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      const r = queue.length > 1 ? queue.shift() : queue[0];
      if (!r) throw new Error('no reply queued');
      return new Response(r.sse ?? JSON.stringify(r.body), {
        status: r.status,
        headers: { 'content-type': r.sse ? 'text/event-stream' : 'application/json' },
      });
    },
  });
  return { provider, requests, sink };
}

describe.skipIf(!haveFixtures)('LLM adapter on recorded BoxAPI fixtures', () => {
  it('complete: text, usage + cost on the timeline, reasoning_effort low, never `tools`', async () => {
    const f = fixture('chat');
    const { provider, requests, sink } = setup([f]);
    const { text, usage } = await provider.complete(
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      {
        job: 'narrator',
      },
    );
    expect(text.trim()).toBe(f.body?.choices[0]?.message.content.trim());
    expect(requests[0]).toMatchObject({ model: 'gpt-5.4-mini', reasoning_effort: 'low' });
    expect(requests[0]).not.toHaveProperty('tools');
    expectUsageMapped(usage, expectedUsage(f), sink.events, 'narrator');
    expect(sink.events[0]).toMatchObject({
      type: 'llm_call',
      status: 'success',
      llm: { job: 'narrator' },
    });
  });

  it('stream: yields deltas, asks for usage, records the call', async () => {
    const f = fixture('stream');
    const { provider, requests, sink } = setup([f]);
    const { textStream, usage } = provider.stream([{ role: 'user', content: 'Count' }], {
      job: 'narrator',
    });
    let text = '';
    for await (const delta of textStream) text += delta;
    expect(text).toMatch(/1.*2.*3/);
    expect(requests[0]).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    // Usage comes from the final SSE chunk; reasoning tokens sit in completion_tokens_details.
    expectUsageMapped(await usage, expectedUsage(f), sink.events, 'narrator');
    expect(sink.events.map((e) => e.type)).toEqual(['llm_call']);
  });

  it('completeJSON: strict json_schema, zod-validated', async () => {
    const f = fixture('json-schema-router');
    const { provider, requests, sink } = setup([f]);
    const { data, usage } = await provider.completeJSON(
      RecordRouterOutput,
      [{ role: 'user', content: 'x' }],
      {
        name: 'router',
        job: 'router',
      },
    );
    expect(data).toEqual({ intent: 'restart', appName: 'miara-demo' });
    expectUsageMapped(usage, expectedUsage(f), sink.events, 'router');
    expect(requests[0]?.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'router', strict: true },
    });
  });

  it('completeJSON: one repair retry fixes invalid output', async () => {
    const good = fixture('json-schema-router');
    const bad = withContent(good, '{"intent":"reboot","appName":null}');
    const { provider, requests, sink } = setup([bad, good]);
    const { data, usage } = await provider.completeJSON(
      RecordRouterOutput,
      [{ role: 'user', content: 'x' }],
      {
        name: 'router',
        job: 'router',
      },
    );
    expect(data.intent).toBe('restart');
    expect(requests).toHaveLength(2);
    const repairMessages = requests[1]?.messages as { role: string; content: string }[];
    expect(repairMessages.at(-2)).toMatchObject({
      role: 'assistant',
      content: '{"intent":"reboot","appName":null}',
    });
    expect(repairMessages.at(-1)?.content).toContain('intent');
    expect(sink.events.filter((e) => e.type === 'llm_call')).toHaveLength(2);
    // Both calls are billed: the returned usage is the sum of the two recorded usages.
    const one = expectedUsage(good);
    const sum = (k: keyof Mapped) => (one[k] ?? 0) * 2;
    for (const key of ['promptTokens', 'completionTokens', 'reasoningTokens', 'costUsd'] as const) {
      expect(typeof usage[key], key).toBe('number');
      expect(usage[key], key).toBeCloseTo(sum(key), 12);
    }
    // Each call's own event carries one recording's numbers.
    for (const e of sink.events.filter((ev) => ev.type === 'llm_call')) {
      expect(e.llm?.costUsd).toBeCloseTo(one.costUsd, 12);
      expect(e.llm?.promptTokens).toBe(one.promptTokens);
    }
    expect(usage.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('completeJSON: gives up after one repair with a typed error', async () => {
    const bad = withContent(fixture('json-schema-router'), 'not json at all');
    const { provider, requests } = setup([bad]);
    const err = await provider
      .completeJSON(RecordRouterOutput, [{ role: 'user', content: 'x' }], {
        name: 'router',
        job: 'router',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toMatchObject({ kind: 'invalid_json' });
    expect((err as LlmError).messageFa).toContain('دکمه‌های سریع');
    expect(requests).toHaveLength(2);
  });
});

describe('LLM adapter (no fixtures needed)', () => {
  it('an HTTP error becomes LlmError with the key redacted, recorded as a failed call', async () => {
    const { provider, sink } = setup([{ status: 401, body: { error: `bad key ${KEY}` } as never }]);
    const err = (await provider
      .complete([{ role: 'user', content: 'x' }], { job: 'router' })
      .catch((e: unknown) => e)) as LlmError;
    expect(err).toMatchObject({ kind: 'http', status: 401 });
    expect(JSON.stringify(err.raw)).not.toContain(KEY);
    expect(sink.events[0]).toMatchObject({ type: 'llm_call', status: 'failure' });
  });

  it('a body that fails the Completion schema is invalid_response naming the paths, not the values', async () => {
    const { provider } = setup([
      {
        status: 200,
        body: {
          choices: [{ message: { content: 42 } }],
          usage: { prompt_tokens: 'VALUE-XYZ' },
        } as never,
      },
    ]);
    const err = (await provider
      .complete([{ role: 'user', content: 'x' }], { job: 'router' })
      .catch((e: unknown) => e)) as LlmError;
    expect(err).toMatchObject({ kind: 'invalid_response', status: 200 });
    expect(err.message).toContain('choices.0.message.content');
    expect(err.message).toContain('usage.prompt_tokens');
    expect(err.raw).toMatchObject({
      issues: [{ path: 'choices.0.message.content' }, { path: 'usage.prompt_tokens' }],
    });
    expect(JSON.stringify(err.raw) + err.message).not.toContain('VALUE-XYZ');
  });

  it('strictJsonSchema accepts nullable fields and rejects optional ones', () => {
    expect(strictJsonSchema(RecordRouterOutput)).toMatchObject({
      required: ['intent', 'appName'],
      additionalProperties: false,
    });
    expect(() => strictJsonSchema(z.object({ a: z.string().optional() }))).toThrow(/required/);
    expect(() =>
      assertStrictCompatible({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
      }),
    ).toThrow(/additionalProperties/);
  });
});
