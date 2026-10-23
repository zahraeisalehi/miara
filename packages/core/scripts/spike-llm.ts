// Spike A (docs/PHASES.md Phase 1): what BoxAPI actually supports. Run: pnpm spike:llm
// Never sends `tools` (BoxAPI has no tool calling). Never prints headers or keys.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { z } from 'zod';

import { redactString } from '../src/redact/index.js';

import { loadSpikeEnv, percentile } from './_env.js';

const BASE_URL = 'https://ai.boxapi.ir/ai/v1';
const TIMEOUT_MS = 60_000;

const { env, secrets } = loadSpikeEnv(['BOXAPI_API_KEY', 'BOXAPI_MODEL']);
const MODEL = env.BOXAPI_MODEL ?? '';
const API_KEY = env.BOXAPI_API_KEY ?? '';

// Router contract from docs/ARCHITECTURE.md "LLM layer".
const INTENTS = [
  'deploy',
  'status',
  'logs',
  'diagnose',
  'restart',
  'start_stop',
  'change_plan',
  'set_env',
  'domain_setup',
  'backup',
  'explain',
  'smalltalk',
] as const;
const RouterOutput = z.object({
  intent: z.enum(INTENTS),
  appName: z.string().nullable().optional(),
});

const ChatCompletion = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
});
const StreamChunk = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).optional() }))
    .optional(),
});

type Message = { role: 'system' | 'user'; content: string };
type Result = { name: string; ok: boolean; ms: number; note: string };

const results: Result[] = [];
let reasoningEffort: 'low' | undefined;

function record(name: string, ok: boolean, ms: number, note: string): void {
  results.push({ name, ok, ms, note });
  console.log(`\n## ${name}: ${ok ? 'OK' : 'FAIL'} (${ms} ms)\n${note}`);
}

function errorText(err: unknown): string {
  return redactString(err instanceof Error ? err.message : String(err), secrets);
}

async function post(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...body,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function chat(
  messages: Message[],
  extra: Record<string, unknown> = {},
): Promise<{ status: number; ms: number; content: string; usage: unknown; raw: string }> {
  const started = performance.now();
  const res = await post({ messages, ...extra });
  const raw = await res.text();
  const ms = Math.round(performance.now() - started);
  if (!res.ok)
    return {
      status: res.status,
      ms,
      content: '',
      usage: undefined,
      raw: redactString(raw, secrets),
    };
  const parsed = ChatCompletion.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return {
      status: res.status,
      ms,
      content: '',
      usage: undefined,
      raw: redactString(raw.slice(0, 1000), secrets),
    };
  }
  return {
    status: res.status,
    ms,
    content: parsed.data.choices[0]?.message.content ?? '',
    usage: parsed.data.usage,
    raw: '',
  };
}

function parseJsonFromContent(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  return JSON.parse((fenced?.[1] ?? content).trim());
}

async function probeReasoningEffort(): Promise<void> {
  reasoningEffort = 'low';
  const r = await chat([{ role: 'user', content: 'Reply with exactly: OK' }]);
  if (r.status >= 200 && r.status < 300) {
    record(
      '0. reasoning_effort=low',
      true,
      r.ms,
      `Accepted; used for all later calls. usage=${JSON.stringify(r.usage)}`,
    );
  } else {
    reasoningEffort = undefined;
    record(
      '0. reasoning_effort=low',
      false,
      r.ms,
      `HTTP ${r.status}; dropped for later calls. body=${r.raw.slice(0, 500)}`,
    );
  }
}

async function plainChat(): Promise<void> {
  const r = await chat([{ role: 'user', content: 'Reply with exactly: OK' }]);
  const ok = r.status === 200 && r.content.trim().length > 0;
  record(
    '1. plain chat',
    ok,
    r.ms,
    `HTTP ${r.status} content=${JSON.stringify(r.content)} usage=${JSON.stringify(r.usage)} ${r.raw}`,
  );
}

async function rawStream(): Promise<void> {
  const started = performance.now();
  let firstTokenMs = -1;
  let chunks = 0;
  let text = '';
  try {
    const res = await post({
      messages: [{ role: 'user', content: 'Count from 1 to 10, separated by spaces.' }],
      stream: true,
    });
    if (!res.ok || !res.body) {
      const body = redactString(await res.text(), secrets);
      record(
        '2. streaming (raw SSE)',
        false,
        Math.round(performance.now() - started),
        `HTTP ${res.status} ${body.slice(0, 500)}`,
      );
      return;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const part of res.body) {
      buffer += decoder.decode(part, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const chunk = StreamChunk.safeParse(JSON.parse(data));
        const delta = chunk.success ? (chunk.data.choices?.[0]?.delta?.content ?? '') : '';
        if (delta && firstTokenMs < 0) firstTokenMs = Math.round(performance.now() - started);
        if (delta) chunks += 1;
        text += delta;
      }
    }
    const ms = Math.round(performance.now() - started);
    record(
      '2. streaming (raw SSE)',
      chunks > 1,
      ms,
      `ttft=${firstTokenMs} ms, chunks=${chunks}, text=${JSON.stringify(text)}`,
    );
  } catch (err) {
    record(
      '2. streaming (raw SSE)',
      false,
      Math.round(performance.now() - started),
      errorText(err),
    );
  }
}

async function sdkStream(): Promise<void> {
  const provider = createOpenAICompatible({ name: 'boxapi', baseURL: BASE_URL, apiKey: API_KEY });
  const started = performance.now();
  let firstTokenMs = -1;
  let chunks = 0;
  let text = '';
  try {
    const result = streamText({
      model: provider(MODEL),
      prompt: 'Count from 1 to 10, separated by spaces.',
      ...(reasoningEffort ? { providerOptions: { boxapi: { reasoningEffort } } } : {}),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      maxRetries: 0,
    });
    for await (const delta of result.textStream) {
      if (firstTokenMs < 0) firstTokenMs = Math.round(performance.now() - started);
      chunks += 1;
      text += delta;
    }
    const ms = Math.round(performance.now() - started);
    record(
      '3. streaming (AI SDK openai-compatible)',
      chunks > 0,
      ms,
      `ttft=${firstTokenMs} ms, chunks=${chunks}, text=${JSON.stringify(text)}`,
    );
  } catch (err) {
    record(
      '3. streaming (AI SDK openai-compatible)',
      false,
      Math.round(performance.now() - started),
      errorText(err),
    );
  }
}

const ROUTER_MESSAGES: Message[] = [
  {
    role: 'system',
    content:
      `You are the intent router of a deployment assistant. Answer ONLY with a JSON object ` +
      `{"intent": one of ${INTENTS.join('|')}, "appName": string or null}.`,
  },
  { role: 'user', content: 'اپ miara-demo رو ری‌استارت کن' },
];

async function jsonMode(name: string, responseFormat: Record<string, unknown>): Promise<void> {
  try {
    const r = await chat(ROUTER_MESSAGES, { response_format: responseFormat });
    if (r.status !== 200) {
      record(name, false, r.ms, `HTTP ${r.status} ${r.raw.slice(0, 500)}`);
      return;
    }
    let parsedJson: unknown;
    try {
      parsedJson = parseJsonFromContent(r.content);
    } catch {
      record(name, false, r.ms, `Not JSON: ${JSON.stringify(r.content.slice(0, 300))}`);
      return;
    }
    const parsed = RouterOutput.safeParse(parsedJson);
    const correct =
      parsed.success && parsed.data.intent === 'restart' && parsed.data.appName === 'miara-demo';
    record(
      name,
      parsed.success,
      r.ms,
      `zod=${parsed.success ? 'pass' : 'fail'}, expected {restart, miara-demo}: ${correct ? 'match' : 'mismatch'}, ` +
        `content=${JSON.stringify(r.content)}` +
        (parsed.success ? '' : `, issues=${JSON.stringify(parsed.error.issues)}`),
    );
  } catch (err) {
    record(name, false, 0, errorText(err));
  }
}

async function persian(): Promise<void> {
  try {
    const r = await chat([
      {
        role: 'system',
        content:
          'تو دستیار فنی Miara هستی. به فارسی ساده، کوتاه و دوستانه برای یک برنامه‌نویس غیرمتخصص در دواپس توضیح بده.',
      },
      {
        role: 'user',
        content:
          'Explain to the user, in simple Persian, that their app "miara-demo" was restarted because its memory usage ' +
          'reached 95% of the plan limit, and suggest one next step. 3-4 sentences.',
      },
    ]);
    record(
      '6. Persian narrator answer',
      r.status === 200 && r.content.length > 0,
      r.ms,
      `HTTP ${r.status}\n${r.content || r.raw}`,
    );
  } catch (err) {
    record('6. Persian narrator answer', false, 0, errorText(err));
  }
}

async function latency(): Promise<void> {
  const runs: number[] = [];
  const failures: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    try {
      const r = await chat([{ role: 'user', content: 'Say hi in one word.' }]);
      if (r.status === 200) runs.push(r.ms);
      else failures.push(`run ${i + 1}: HTTP ${r.status}`);
    } catch (err) {
      failures.push(`run ${i + 1}: ${errorText(err)}`);
    }
  }
  const sorted = [...runs].sort((a, b) => a - b);
  const stats =
    `runs=[${runs.join(', ')}] ms, min=${sorted[0] ?? 'n/a'}, p50=${percentile(sorted, 50)}, ` +
    `p95=${percentile(sorted, 95)}, max=${sorted.at(-1) ?? 'n/a'}`;
  record(
    '7. latency (5 runs)',
    failures.length === 0,
    sorted.at(-1) ?? 0,
    failures.length ? `${stats}\n${failures.join('\n')}` : stats,
  );
}

async function main(): Promise<void> {
  console.log(`BoxAPI spike, model=${MODEL}, base=${BASE_URL}`);
  await probeReasoningEffort();
  await plainChat();
  await rawStream();
  await sdkStream();
  await jsonMode('4. response_format json_object', { type: 'json_object' });
  await jsonMode('5. response_format json_schema (strict)', {
    type: 'json_schema',
    json_schema: {
      name: 'router',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: INTENTS },
          appName: { type: ['string', 'null'] },
        },
        required: ['intent', 'appName'],
        additionalProperties: false,
      },
    },
  });
  await persian();
  await latency();

  console.log('\n----- PASTE EVERYTHING BELOW BACK TO CLAUDE -----');
  console.log(
    `### BoxAPI spike (${new Date().toISOString()}, model ${MODEL}, reasoning_effort ${reasoningEffort ?? 'not sent'})`,
  );
  console.log('| Test | Result | ms | Notes |\n|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.ms} | ${r.note.replace(/\s*\n\s*/g, ' ⏎ ').replace(/\|/g, '\\|')} |`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(`spike-llm crashed: ${errorText(err)}`);
  process.exit(1);
});
