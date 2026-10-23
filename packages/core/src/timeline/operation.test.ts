import { describe, expect, it } from 'vitest';

import { LiaraError } from '../liara/errors.js';
import { PolicyError } from '../policy/errors.js';

import { createMemoryTimelineSink } from './memory.js';
import { createTimeline } from './operation.js';
import type { OperationMeta } from './operation.js';

const SECRET = 'liara-token-abcdefgh123';
const meta: OperationMeta = {
  tool: 'restart_app',
  app: 'demo',
  tier: 1,
  mode: 'auto',
  actor: 'web',
  labelFa: 'ری‌استارت اپ',
  labelEn: 'Restart the app',
};

function setup() {
  const sink = createMemoryTimelineSink();
  return { sink, timeline: createTimeline({ sink, secrets: [SECRET] }) };
}

describe('timeline.withOperation', () => {
  it('writes start then success under one operation id', async () => {
    const { sink, timeline } = setup();
    expect(await timeline.withOperation(meta, async () => 42)).toBe(42);
    expect(sink.events.map((e) => e.status)).toEqual(['start', 'success']);
    expect(new Set(sink.events.map((e) => e.operationId)).size).toBe(1);
    expect(sink.events[1]?.messageFa).toBe('ری‌استارت اپ: انجام شد');
  });

  it('writes a failure with the redacted raw error and a plain Persian explanation', async () => {
    const { sink, timeline } = setup();
    const err = new LiaraError({
      kind: 'not_found',
      status: 404,
      endpoint: 'GET /v1/projects/{app}',
      raw: { echo: `Bearer ${SECRET}` },
    });
    await expect(timeline.withOperation(meta, async () => Promise.reject(err))).rejects.toBe(err);
    const failure = sink.events[1];
    expect(failure).toMatchObject({ status: 'failure', errorExplanationFa: err.messageFa });
    expect(failure?.errorRaw).toMatchObject({
      kind: 'not_found',
      status: 404,
      endpoint: 'GET /v1/projects/{app}',
    });
    expect(JSON.stringify(sink.events)).not.toContain(SECRET);
  });

  it('explains policy errors and unexpected errors too', async () => {
    const { sink, timeline } = setup();
    await timeline
      .withOperation(meta, async () => Promise.reject(new PolicyError('expired')))
      .catch(() => {});
    await timeline
      .withOperation(meta, async () => Promise.reject(new Error('boom')))
      .catch(() => {});
    const failures = sink.events.filter((e) => e.status === 'failure');
    expect(failures[0]?.errorExplanationFa).toContain('مهلت');
    expect(failures[1]?.errorExplanationFa).toContain('خطای داخلی');
  });

  it('redacts data written with the start event', async () => {
    const { sink, timeline } = setup();
    await timeline.withOperation(
      { ...meta, data: { note: `token ${SECRET}`, envs: [{ key: 'K', value: 'v' }] } },
      async () => 1,
    );
    expect(JSON.stringify(sink.events)).not.toContain(SECRET);
    expect(sink.events[0]?.data).toMatchObject({ envs: [{ key: 'K', value: '[REDACTED]' }] });
  });

  it('records LLM usage and cost', async () => {
    const { sink, timeline } = setup();
    await timeline.recordLlm(
      {
        job: 'router',
        model: 'gpt-5.4-mini',
        promptTokens: 11,
        completionTokens: 15,
        costUsd: 0.0000612,
        latencyMs: 1700,
      },
      { actor: 'web', ok: true },
    );
    expect(sink.events[0]).toMatchObject({
      type: 'llm_call',
      status: 'success',
      llm: { job: 'router', costUsd: 0.0000612 },
    });
  });

  it('countAutoStarts counts only auto starts of that tool and app since the given time', async () => {
    const { sink, timeline } = setup();
    await timeline.withOperation(meta, async () => 1);
    await timeline.withOperation({ ...meta, mode: 'approved' }, async () => 1);
    await timeline.withOperation({ ...meta, app: 'other' }, async () => 1);
    expect(
      await sink.countAutoStarts({ tool: 'restart_app', app: 'demo', since: new Date(0) }),
    ).toBe(1);
    expect(
      await sink.countAutoStarts({
        tool: 'restart_app',
        app: 'demo',
        since: new Date(Date.now() + 1000),
      }),
    ).toBe(0);
  });
});
