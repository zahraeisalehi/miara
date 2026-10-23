// Records redacted raw BoxAPI responses as fixtures for the offline LLM adapter tests (test/fixtures/llm/).
// Run by the developer: pnpm spike:llm --record   (read-only; 3 small calls, about $0.0005)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { strictJsonSchema } from '../src/llm/json.js';
import { BOXAPI_BASE_URL } from '../src/llm/openai-compatible.js';
import { assertClean, redactDeep, redactString } from '../src/redact/index.js';

import { REPO_ROOT, loadSpikeEnv } from './_env.js';

const DIR = resolve(REPO_ROOT, 'packages/core/test/fixtures/llm');

/** Same contract as the spike's router test; strict-compatible (nullable, not optional). */
export const RecordRouterOutput = z.object({
  intent: z.enum(['deploy', 'status', 'logs', 'diagnose', 'restart', 'start_stop', 'smalltalk']),
  appName: z.string().nullable(),
});

const ROUTER_MESSAGES = [
  {
    role: 'system',
    content:
      'You are the intent router of a deployment assistant. Answer only with JSON matching the schema.',
  },
  { role: 'user', content: 'اپ miara-demo رو ری‌استارت کن' },
];

export async function recordLlmFixtures(): Promise<void> {
  const { env, secrets } = loadSpikeEnv(['BOXAPI_API_KEY', 'BOXAPI_MODEL']);
  const model = env.BOXAPI_MODEL ?? '';
  mkdirSync(DIR, { recursive: true });

  async function call(name: string, body: Record<string, unknown>, stream = false): Promise<void> {
    const request = { model, reasoning_effort: 'low', ...body };
    const res = await fetch(`${BOXAPI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.BOXAPI_API_KEY ?? ''}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    const fixture = {
      source: 'recorded live by scripts/record-llm.ts',
      capturedAt: new Date().toISOString(),
      request: redactDeep(request, secrets),
      status: res.status,
      ...(stream
        ? { sse: redactString(text, secrets) }
        : { body: redactDeep(JSON.parse(text), secrets) }),
    };
    const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
    assertClean(serialized, secrets);
    writeFileSync(resolve(DIR, `${name}.json`), serialized);
    console.log(`${res.status} ${name}.json`);
  }

  await call('chat', { messages: [{ role: 'user', content: 'Reply with exactly: OK' }] });
  await call(
    'stream',
    {
      messages: [{ role: 'user', content: 'Count from 1 to 5, separated by spaces.' }],
      stream: true,
      stream_options: { include_usage: true },
    },
    true,
  );
  await call('json-schema-router', {
    messages: ROUTER_MESSAGES,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'router', strict: true, schema: strictJsonSchema(RecordRouterOutput) },
    },
  });
  console.log(`LLM fixtures written to ${DIR}`);
}
